import OpenAI from "openai";

// The newest OpenAI model is "gpt-4o" which was released May 13, 2024. Do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Analyze CSV structure to identify column semantic meanings
export async function analyzeCSVStructure(
  headers: string[],
  sampleData: Record<string, string>[]
): Promise<Record<string, string>> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert in Indian financial data analysis. 
          You specialize in Indian accounting terminology, GST/tax analysis, and understanding various formats of
          voucher numbers (Vou No., Vch No., V.No., etc.), invoice numbers, and financial record identifiers.`
        },
        {
          role: "user",
          content: `Analyze this CSV data and identify the semantic type of each column. 
          Pay special attention to identifying Indian financial data columns like voucher numbers, GST details, tax information, amounts, etc.
          
          Headers: ${JSON.stringify(headers)}
          Sample data: ${JSON.stringify(sampleData.slice(0, 5))}
          
          Respond with a JSON object mapping each column name to one of these semantic types:
          - invoice_number (or voucher number, document ID)
          - customer_name
          - date
          - amount (monetary value)
          - tax (tax value)
          - tax_rate (tax percentage)
          - quantity
          - product (product name/description)
          - city
          - state
          - gstin (Indian GST identification number)
          - pan (permanent account number)
          - unknown (if not classifiable)
          
          Only include these particular types in your response, nothing else.`
        }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error("Error analyzing CSV structure with OpenAI:", error);
    // Fallback to basic analysis
    return headers.reduce((acc, header) => {
      acc[header] = inferSemanticType(header);
      return acc;
    }, {} as Record<string, string>);
  }
}

// Analyze a query to determine the type and requirements
export async function analyzeQuery(
  prompt: string,
  headers: string[]
): Promise<{
  queryType: string;
  confidence: number;
  detectedEntities: string[];
  detectedColumns: string[];
  requiresVoucherAnalysis: boolean;
  requiresTaxAnalysis: boolean;
}> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert in Indian financial data analysis, specializing in understanding financial queries, 
          particularly those using Indian accounting terminology. You understand various forms of voucher numbers, 
          GST/tax references, and financial terms used in Indian business contexts.`
        },
        {
          role: "user",
          content: `Analyze this query about CSV financial data and classify it.
          
          Query: "${prompt}"
          Available columns: ${JSON.stringify(headers)}
          
          Determine:
          1. The query type (one of: HIGHEST_SALES, TOP_PRODUCTS, CITY_ANALYSIS, TIME_COMPARISON, TAX_CALCULATION, TREND_ANALYSIS, PRODUCT_INSIGHTS, SUMMARY_STATISTICS, UNKNOWN)
          2. Your confidence in this classification (0.0-1.0)
          3. Any specific entities mentioned in the query (like product names, cities, etc.)
          4. Which columns from the available columns are relevant to this query
          5. Whether this query specifically requires voucher/invoice number analysis
          6. Whether this query specifically requires tax-related analysis (GST, SGST, CGST, etc.)
          
          Respond only with a JSON object containing these determinations.`
        }
      ],
      response_format: { type: "json_object" }
    });

    return JSON.parse(response.choices[0].message.content || '{}');
  } catch (error) {
    console.error("Error analyzing query with OpenAI:", error);
    // Simple fallback
    return {
      queryType: "UNKNOWN",
      confidence: 0.3,
      detectedEntities: [],
      detectedColumns: [],
      requiresVoucherAnalysis: prompt.toLowerCase().includes("voucher") || 
                               prompt.toLowerCase().includes("vou no") || 
                               prompt.toLowerCase().includes("vch"),
      requiresTaxAnalysis: prompt.toLowerCase().includes("tax") || 
                            prompt.toLowerCase().includes("gst")
    };
  }
}

// Generate comprehensive analysis of the CSV data based on the query
export async function generateCSVAnalysis(
  prompt: string,
  data: Record<string, string>[],
  headers: string[],
  columnTypes: Record<string, string>,
  previousResults: string = ""
): Promise<string> {
  try {
    // Prepare context and examples for specific Indian financial data
    const preparedData = data.slice(0, 10); // Use a sample for analysis
    const contextPrompt = `
    The data being analyzed is Indian financial data with the following columns:
    ${headers.map(h => `- ${h} (type: ${columnTypes[h] || 'unknown'})`).join('\n')}
    
    Total number of records: ${data.length}
    
    Here are a few sample records:
    ${JSON.stringify(preparedData, null, 2)}
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert financial data analyst specializing in Indian accounting and financial data.
          
          When analyzing data:
          - Look for patterns in Indian GST/tax calculations and reporting
          - Understand various formats of voucher numbers and invoices used in Indian accounting
          - Format currency values in Indian style (e.g., ₹1,00,000.00 for 100,000)
          - Handle Indian date formats properly (DD-MM-YYYY is common)
          - When dealing with large numbers, use Indian conventions (lakhs, crores) when appropriate
          - For tax calculations, be aware of CGST, SGST, IGST components in Indian context
          - Be precise with numerical analysis and summarize findings clearly
          - If relevant data is missing, explain what would be needed for better analysis`
        },
        {
          role: "user",
          content: `${contextPrompt}
          
          The user's query is: "${prompt}"
          
          ${previousResults ? `Previous analysis already showed: ${previousResults}` : ''}
          
          Analyze the data comprehensively to answer this query. Provide clear insights, calculations and summaries as appropriate. Include relevant metrics, aggregates, and patterns that address the user's needs.`
        }
      ]
    });

    return response.choices[0].message.content || '';
  } catch (error) {
    console.error("Error generating analysis with OpenAI:", error);
    return "I'm sorry, I encountered an error while analyzing your data. Please try a more specific query or check the format of your CSV file.";
  }
}

// Basic type inference function as fallback
function inferSemanticType(header: string): string {
  const headerLower = header.toLowerCase();
  
  // Voucher/Invoice number detection with Indian accounting terminology
  if (headerLower.includes("vou") && (headerLower.includes("no") || headerLower.includes("num")) ||
      headerLower.includes("voucher") ||
      headerLower.includes("vch") && (headerLower.includes("no") || headerLower.includes("num")) ||
      headerLower.includes("bill") && headerLower.includes("no") ||
      headerLower.includes("invoice") && (headerLower.includes("no") || headerLower.includes("num")) ||
      headerLower.includes("ref") && headerLower.includes("no") ||
      headerLower === "v.no" || headerLower === "v no" || headerLower === "doc no" ||
      headerLower === "document no" || headerLower === "challan no") {
    return "invoice_number";
  }

  // Date detection
  if (headerLower.includes("date") || headerLower === "dt" ||
      headerLower.includes("day") || headerLower.includes("month") || 
      headerLower.includes("year") || headerLower.includes("time")) {
    return "date";
  }

  // Amount detection
  if (headerLower.includes("amount") || headerLower.includes("amt") ||
      headerLower.includes("total") || headerLower.includes("sum") ||
      headerLower.includes("value") || headerLower.includes("price") ||
      headerLower.includes("cost") || headerLower.includes("rs") ||
      headerLower.includes("inr") || headerLower.includes("rupee")) {
    return "amount";
  }

  // Tax detection with Indian context
  if (headerLower.includes("tax") || headerLower.includes("gst") ||
      headerLower.includes("cgst") || headerLower.includes("sgst") ||
      headerLower.includes("igst") || headerLower.includes("vat") ||
      headerLower.includes("cess")) {
    if (headerLower.includes("rate") || headerLower.includes("%") || 
        headerLower.includes("percent")) {
      return "tax_rate";
    }
    return "tax";
  }

  // Quantity detection
  if (headerLower.includes("quantity") || headerLower.includes("qty") ||
      headerLower.includes("count") || headerLower.includes("number of") ||
      headerLower.includes("units")) {
    return "quantity";
  }

  // Product detection
  if (headerLower.includes("product") || headerLower.includes("item") ||
      headerLower.includes("goods") || headerLower.includes("service") ||
      headerLower.includes("description") || headerLower === "desc" ||
      headerLower.includes("particular")) {
    return "product";
  }

  // Customer name detection
  if (headerLower.includes("customer") || headerLower.includes("client") ||
      headerLower.includes("buyer") || headerLower.includes("party") ||
      headerLower.includes("account name") || headerLower.includes("ledger")) {
    return "customer_name";
  }

  // City detection
  if (headerLower === "city" || headerLower.includes("town") ||
      headerLower.includes("district") || headerLower.includes("location")) {
    return "city";
  }

  // State detection
  if (headerLower === "state" || headerLower.includes("province") ||
      headerLower === "region") {
    return "state";
  }

  // GSTIN detection
  if (headerLower === "gstin" || headerLower.includes("gst id") ||
      headerLower.includes("gst no") || headerLower.includes("gst number")) {
    return "gstin";
  }

  // PAN detection
  if (headerLower === "pan" || headerLower.includes("pan no") ||
      headerLower.includes("pan card") || headerLower.includes("permanent account number")) {
    return "pan";
  }

  return "unknown";
}