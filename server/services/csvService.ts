import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import fetch from 'node-fetch';

// Configuration
const NLP_API_URL = 'http://localhost:8000';

// Column semantic types for better financial data understanding
enum ColumnSemanticType {
  INVOICE_NUMBER = "invoice_number",
  CUSTOMER_NAME = "customer_name",
  DATE = "date",
  AMOUNT = "amount",
  TAX = "tax",
  TAX_RATE = "tax_rate",
  QUANTITY = "quantity",
  PRODUCT = "product",
  CITY = "city",
  STATE = "state",
  GSTIN = "gstin",
  PAN = "pan",
  UNKNOWN = "unknown"
}

// Query types based on Indian financial context
enum QueryType {
  HIGHEST_SALES = "HIGHEST_SALES",
  TOP_PRODUCTS = "TOP_PRODUCTS",
  CITY_ANALYSIS = "CITY_ANALYSIS",
  TIME_COMPARISON = "TIME_COMPARISON",
  TAX_CALCULATION = "TAX_CALCULATION",
  TREND_ANALYSIS = "TREND_ANALYSIS",
  PRODUCT_INSIGHTS = "PRODUCT_INSIGHTS",
  SUMMARY_STATISTICS = "SUMMARY_STATISTICS",
  UNKNOWN = "UNKNOWN"
}

// Check if the NLP backend is available
export function checkNLPAvailability(): boolean {
  try {
    // Our NLP functionality is integrated directly into the Express server
    // So we'll report that it's available
    return true;
  } catch (error) {
    console.error('Error checking NLP availability:', error);
    return false;
  }
}

// Process a CSV file with a prompt
export async function processCSV(
  csvData: Buffer | null, 
  prompt: string,
  chatHistory: Array<{role: string, content: string}> = []
): Promise<string> {
  try {
    return enhancedCSVProcessing(csvData, prompt, chatHistory);
  } catch (error) {
    console.error('Error processing CSV:', error);
    return `I'm having trouble processing your request. ${error instanceof Error ? error.message : 'Please try again later.'}`;
  }
}

// Enhanced CSV processing function with financial data analysis capabilities
async function enhancedCSVProcessing(
  csvData: Buffer | null, 
  prompt: string,
  chatHistory: Array<{role: string, content: string}> = []
): Promise<string> {
  // If no file is provided, return general information
  if (!csvData) {
    if (isFinancialQuery(prompt)) {
      return "I need a CSV file to analyze financial data. Please upload a file with your financial, invoice, or transaction information first.";
    }

    return "I'm designed to analyze CSV data with a focus on Indian financial contexts. Please upload a CSV file to continue.";
  }

  try {
    // Parse CSV data with enhanced parsing to handle different formats
    const { data, headers, columnTypes, columnSemanticTypes } = parseCSV(csvData);

    // Count the number of rows
    const rowCount = data.length;

    // Classify the query type
    const queryClassification = await classifyQuery(prompt);

    // Extract entity references (e.g., specific companies, products)
    const entityReferences = extractEntityReferences(prompt, data, headers);

    // Process query based on classification
    const { queryType, confidence } = queryClassification;
    
    switch (queryType) {
      case QueryType.TAX_CALCULATION:
        return handleTaxQuery(prompt, data, headers, columnTypes, columnSemanticTypes, entityReferences);

      case QueryType.HIGHEST_SALES:
        return handleHighestSalesQuery(prompt, data, headers, columnTypes, columnSemanticTypes, entityReferences);

      case QueryType.TOP_PRODUCTS:
        return handleTopProductsQuery(prompt, data, headers, columnTypes, columnSemanticTypes, entityReferences);

      case QueryType.CITY_ANALYSIS:
        return handleCityAnalysisQuery(prompt, data, headers, columnTypes, columnSemanticTypes, entityReferences);

      case QueryType.TIME_COMPARISON:
        return handleTimeComparisonQuery(prompt, data, headers, columnTypes, columnSemanticTypes, entityReferences);

      case QueryType.TREND_ANALYSIS:
        return handleTrendAnalysisQuery(prompt, data, headers, columnTypes, columnSemanticTypes, entityReferences);

      case QueryType.PRODUCT_INSIGHTS:
        return handleProductInsightsQuery(prompt, data, headers, columnTypes, columnSemanticTypes, entityReferences);

      case QueryType.SUMMARY_STATISTICS:
        return handleSummaryStatisticsQuery(prompt, data, headers, columnTypes, columnSemanticTypes, entityReferences);

      default:
        // Handle count queries (how many, total number of, etc.)
        if (isCountQuery(prompt)) {
          // Check for date-specific count queries
          const promptLower = prompt.toLowerCase();
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

          // Extract month and year if present
          let targetMonth = -1;
          let targetYear = -1;

          for (let i = 0; i < monthNames.length; i++) {
            if (promptLower.includes(monthNames[i])) {
              targetMonth = i + 1; // Convert to 1-based month number
              break;
            }
          }

          // Try to find a year (4 digits)
          const yearMatch = promptLower.match(/\b(20\d{2})\b/);
          if (yearMatch) {
            targetYear = parseInt(yearMatch[1]);
          }

          // If we have both month and year, filter by date
          if (targetMonth > 0 && targetYear > 0) {
            // Find date column (looking for common patterns)
            let dateColumn = '';
            for (const header of headers) {
              const headerLower = header.toLowerCase();
              if (
                headerLower.includes('date') || 
                headerLower.includes('dt') || 
                headerLower.includes('vou date') ||
                headerLower.includes('invoice date') ||
                headerLower.includes('bill date')
              ) {
                dateColumn = header;
                break;
              }
            }

            // Check if query specifically mentions "vou no" or "voucher" - for direct filtering by voucher
            const isVoucherQuery = promptLower.includes('vou no') || 
                                  promptLower.includes('vou no.') ||
                                  promptLower.includes('vch no') ||
                                  promptLower.includes('voucher');

            // Find voucher number column if it's a voucher query
            let voucherColumns: string[] = [];
            if (isVoucherQuery) {
              // First, look for exact "Vou No." column which is commonly used in Indian accounting
              let exactMatch = '';
              for (const header of headers) {
                const headerLower = header.toLowerCase();
                // Check for exact matches first
                if (
                  headerLower === 'vou no.' || 
                  headerLower === 'vou no' ||
                  headerLower === 'voucher no.' ||
                  headerLower === 'voucher no'
                ) {
                  exactMatch = header;
                  break;
                }
              }

              // If we found an exact match, use it
              if (exactMatch) {
                voucherColumns = [exactMatch];
              } else {
                // Otherwise collect all possible voucher columns
                for (const header of headers) {
                  const headerLower = header.toLowerCase();
                  if (
                    headerLower.includes('vou no') || 
                    headerLower.includes('voucher') ||
                    headerLower === 'vou no.' ||
                    headerLower === 'voucher no.' ||
                    headerLower === 'vou. no.' ||
                    headerLower === 'vou.no.' ||
                    headerLower === 'vch no' ||
                    headerLower === 'vch no.' ||
                    headerLower === 'v.no' ||
                    headerLower === 'v no' ||
                    columnSemanticTypes[header] === ColumnSemanticType.INVOICE_NUMBER
                  ) {
                    voucherColumns.push(header);
                  }
                }
              }
            }

            // Select the first voucher column if any were found
            const voucherColumn = voucherColumns.length > 0 ? voucherColumns[0] : '';

            if (dateColumn || voucherColumn) {
              let count = 0;
              const monthStr = targetMonth.toString().padStart(2, '0');

              // Count matching dates
              for (const row of data) {
                let isMatch = false;

                // If we have a date column, check the date
                if (dateColumn) {
                  const dateValue = row[dateColumn];
                  if (dateValue) {
                    // Try to match date in various formats
                    // Check for DD/MM/YYYY format (common in India)
                    if (dateValue.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/)) {
                      const parts = dateValue.split(/[\/\-\.]/);
                      // Assume DD/MM/YYYY format
                      const month = parseInt(parts[1]);
                      const year = parseInt(parts[2]);

                      if (month === targetMonth && year === targetYear) {
                        isMatch = true;
                      }
                    } 
                    // Check for MM/DD/YYYY format
                    else if (dateValue.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/)) {
                      const parts = dateValue.split(/[\/\-\.]/);
                      // Try MM/DD/YYYY
                      let month = parseInt(parts[0]);
                      let year = parseInt(parts[2]);

                      if (month === targetMonth && year === targetYear) {
                        isMatch = true;
                      }
                    }
                    // Check for YYYY-MM-DD format
                    else if (dateValue.match(/\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/)) {
                      const parts = dateValue.split(/[\/\-\.]/);
                      const year = parseInt(parts[0]);
                      const month = parseInt(parts[1]);

                      if (month === targetMonth && year === targetYear) {
                        isMatch = true;
                      }
                    }
                    // Check for text format like "Feb 2025" or "February 2025"
                    else if (dateValue.toLowerCase().includes(monthNames[targetMonth-1]) && 
                             dateValue.includes(targetYear.toString())) {
                      isMatch = true;
                    }
                  }
                }

                // If we matched the date or if there's no date column but we have a voucher column, count it
                if (isMatch || (!dateColumn && voucherColumn)) {
                  count++;
                }
              }

              const monthName = monthNames[targetMonth-1];
              const responseColumn = isVoucherQuery && voucherColumn ? voucherColumn : "date";

              return `I found ${count} ${isVoucherQuery ? 'vouchers' : 'invoices/records'} for ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${targetYear} in your data ${voucherColumn ? `(using the "${voucherColumn}" column)` : ''}.`;
            }
          }

          // Handle invoice query without specific date filtering
          if (isInvoiceQuery(prompt)) {
            // Special case for various voucher number columns - explicitly count them as invoices
            // Enhanced to handle more Indian accounting terminology variations
            const invoiceColumns = headers.filter(header => {
              const headerLower = header.toLowerCase();
              return columnSemanticTypes[header] === ColumnSemanticType.INVOICE_NUMBER || 
                    headerLower.includes('vou no') || 
                    headerLower.includes('voucher') ||
                    headerLower === 'vou no.' ||
                    headerLower === 'voucher no.' ||
                    headerLower === 'vou. no.' ||
                    headerLower === 'vou.no.' ||
                    headerLower === 'vch no' ||
                    headerLower === 'vch no.' ||
                    headerLower === 'v.no' ||
                    headerLower === 'v no';
            });

            if (invoiceColumns.length > 0) {
              // Provide a more informative and context-aware response
              const isVoucher = invoiceColumns[0].toLowerCase().includes('vou') || 
                              invoiceColumns[0].toLowerCase().includes('vch');

              const identifier = isVoucher ? "voucher" : "invoice";
              return `I found ${rowCount} ${identifier}s in your CSV file, using the "${invoiceColumns[0]}" column as the ${identifier} identifier.`;
            }

            return `I found ${rowCount} records in your CSV file. Each row likely represents a separate invoice or transaction.`;
          }

          // Handle specific entity count queries
          if (entityReferences.specificEntities.length > 0) {
            const entity = entityReferences.specificEntities[0];
            let count = 0;

            // Search for entity in all columns
            for (const row of data) {
              if (Object.values(row).some(value => 
                value.toLowerCase().includes(entity.toLowerCase())
              )) {
                count++;
              }
            }

            return `I found ${count} records related to "${entity}" in your data.`;
          }

          return `Your CSV file contains ${rowCount} records in total.`;
        }

        // Default response with enhanced file information
        return generateDefaultResponse(data, headers, columnTypes, columnSemanticTypes);
    }
  } catch (error) {
    console.error('Error in CSV processing:', error);
    return "I had trouble parsing your CSV file. Please make sure it's properly formatted with comma-separated values.";
  }
}

// Parse CSV with enhanced detection of formats
function parseCSV(csvData: Buffer) {
  const csvContent = csvData.toString('utf-8');

  // Try to detect the delimiter
  const firstLine = csvContent.split('\n')[0];
  let delimiter = ',';

  // Count occurrences of potential delimiters
  const delimiters = [',', ';', '\t', '|'];
  const counts = delimiters.map(d => (firstLine.match(new RegExp(`(?<!\\")${d}(?!\\")`, 'g')) || []).length);

  // Use the delimiter with the highest count
  const maxIndex = counts.indexOf(Math.max(...counts));
  if (maxIndex !== -1 && counts[maxIndex] > 0) {
    delimiter = delimiters[maxIndex];
  }

  // Split lines and filter out empty ones
  const lines = csvContent.split('\n').filter(line => line.trim());

  // Handle header line with potential quoting and proper separation
  let headers: string[] = [];
  const headerLine = lines[0];

  if (headerLine.includes('"')) {
    // Parse headers respecting quotes
    let inQuotes = false;
    let currentHeader = '';

    for (let i = 0; i < headerLine.length; i++) {
      const char = headerLine[i];

      if (char === '"' && (i === 0 || headerLine[i-1] !== '\\')) {
        // Toggle quote state
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        // End of a header
        headers.push(currentHeader.trim().replace(/^["']|["']$/g, ''));
        currentHeader = '';
      } else {
        // Regular character
        currentHeader += char;
      }
    }

    // Add the last header
    if (currentHeader.trim()) {
      headers.push(currentHeader.trim().replace(/^["']|["']$/g, ''));
    }
  } else {
    // Simple split for unquoted headers
    headers = headerLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, ''));
  }

  // Check for potential composite header (a common error in CSV files)
  if (headers.length === 1 && headers[0].includes(',')) {
    // This looks like a complex header containing commas
    // Split it properly and handle each column separately
    console.log("Detected composite header:", headers[0]);
    headers = headers[0].split(',').map(h => h.trim());
    console.log("Split into individual headers:", headers);
  }
  
  // Add debugging info for header detection
  console.log("Final headers after parsing:", headers);

  // Convert CSV rows to objects for easier analysis
  const data: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    // Handle quoted values properly
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let j = 0; j < lines[i].length; j++) {
      const char = lines[i][j];

      if (char === '"' && (j === 0 || lines[i][j-1] !== '\\')) {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        values.push(currentValue.trim().replace(/^["']|["']$/g, ''));
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    // Add the last value
    values.push(currentValue.trim().replace(/^["']|["']$/g, ''));

    // Create row object
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = index < values.length ? values[index] : '';
    });

    data.push(row);
  }

  // Detect column types
  const columnTypes: Record<string, string> = {};
  const columnSemanticTypes: Record<string, ColumnSemanticType> = {};

  headers.forEach(header => {
    // Check sample values to determine column type
    const sampleValues = data.slice(0, Math.min(10, data.length)).map(row => row[header]);

    // Check if column contains mostly numbers
    const numericCount = sampleValues.filter(v => !isNaN(Number(v.replace(/,/g, ''))) && v.trim() !== '').length;

    // Determine column type
    if (numericCount >= sampleValues.length / 2) {
      columnTypes[header] = 'numeric';
    } else if (
      header.toLowerCase().includes('date') || 
      sampleValues.some(v => isDateString(v))
    ) {
      columnTypes[header] = 'date';
    } else {
      columnTypes[header] = 'text';
    }

    // Determine semantic type
    columnSemanticTypes[header] = inferSemanticType(header, sampleValues);
  });

  return { data, headers, columnTypes, columnSemanticTypes };
}

// Check if a string resembles a date (including Indian date formats)
function isDateString(str: string): boolean {
  // Check for common date formats (including Indian formats)
  const datePatterns = [
    /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/, // DD/MM/YYYY or MM/DD/YYYY
    /^\d{2,4}[-/]\d{1,2}[-/]\d{1,2}$/, // YYYY/MM/DD
    /^\d{1,2}[-\s][A-Za-z]{3,9}[-\s]\d{2,4}$/, // DD MMM YYYY or DD Month YYYY
    /^[A-Za-z]{3,9}[-\s]\d{1,2}[-\s]\d{2,4}$/, // Month DD YYYY or MMM DD YYYY
  ];

  return datePatterns.some(pattern => pattern.test(str.trim()));
}

// Infer semantic meaning of a column based on header name and sample values
function inferSemanticType(header: string, sampleValues: string[]): ColumnSemanticType {
  const headerLower = header.toLowerCase();

  // Invoice number detection - improved to catch more variations of voucher numbers
  if (headerLower.includes('invoice') || headerLower.includes('bill') || 
      headerLower.includes('receipt') || headerLower === 'no.' || 
      headerLower === 'no' || headerLower.includes('number') ||
      headerLower.includes('vou no') || headerLower.includes('voucher no') || 
      headerLower === 'vou' || headerLower.includes('transaction id') ||
      headerLower === 'vou no.' || headerLower === 'voucher no.' ||
      headerLower === 'vou. no.' || headerLower === 'vou.no.' ||
      headerLower === 'vch no' || headerLower === 'vch no.' ||
      // Common shorthand variations used in Indian accounting
      headerLower === 'vou' || headerLower === 'vch' || 
      headerLower === 'v.no' || headerLower === 'v no' ||
      // Match "no" followed by anything else to catch "Voucher No", etc.
      (headerLower.includes('no') && (headerLower.includes('vou') || headerLower.includes('voucher')))) {
    return ColumnSemanticType.INVOICE_NUMBER;
  }

  // Customer name detection
  if (headerLower.includes('customer') || headerLower.includes('client') || 
      headerLower.includes('buyer') || headerLower.includes('party') ||
      headerLower.includes('name') || headerLower.includes('account')) {
    return ColumnSemanticType.CUSTOMER_NAME;
  }

  // Date detection
  if (headerLower.includes('date') || headerLower.includes('time') || 
      headerLower.includes('day') || headerLower.includes('month') || 
      headerLower.includes('year') || sampleValues.some(v => isDateString(v))) {
    return ColumnSemanticType.DATE;
  }

  // Amount detection
  if (headerLower.includes('amount') || headerLower.includes('value') || 
      headerLower.includes('total') || headerLower.includes('price') || 
      headerLower.includes('cost') || headerLower.includes('fee') ||
      headerLower.includes('charge') || headerLower.includes('sum') ||
      headerLower.includes('rs.') || headerLower.includes('inr') ||
      headerLower.includes('₹')) {
    return ColumnSemanticType.AMOUNT;
  }

  // Tax detection
  if (headerLower.includes('tax') || headerLower.includes('gst') || 
      headerLower.includes('cgst') || headerLower.includes('sgst') || 
      headerLower.includes('igst') || headerLower.includes('vat') ||
      headerLower.includes('cess')) {
    if (headerLower.includes('rate') || headerLower.includes('%')) {
      return ColumnSemanticType.TAX_RATE;
    }
    return ColumnSemanticType.TAX;
  }

  // Quantity detection
  if (headerLower.includes('qty') || headerLower.includes('quantity') || 
      headerLower.includes('count') || headerLower.includes('units') ||
      headerLower.includes('pieces') || headerLower.includes('nos')) {
    return ColumnSemanticType.QUANTITY;
  }

  // Product detection
  if (headerLower.includes('product') || headerLower.includes('item') || 
      headerLower.includes('good') || headerLower.includes('commodity') ||
      headerLower.includes('service') || headerLower.includes('description')) {
    return ColumnSemanticType.PRODUCT;
  }

  // City detection
  if (headerLower.includes('city') || headerLower.includes('town') || 
      headerLower.includes('place') || headerLower === 'loc' || 
      headerLower === 'location') {
    return ColumnSemanticType.CITY;
  }

  // State detection
  if (headerLower.includes('state') || headerLower.includes('province') || 
      headerLower.includes('region')) {
    return ColumnSemanticType.STATE;
  }

  // GSTIN detection
  if (headerLower.includes('gstin') || headerLower.includes('gst no') || 
      headerLower.includes('tax id') || headerLower.includes('tax identification')) {
    return ColumnSemanticType.GSTIN;
  }

  // PAN detection
  if (headerLower.includes('pan') || headerLower === 'permanent account number') {
    return ColumnSemanticType.PAN;
  }

  return ColumnSemanticType.UNKNOWN;
}

// Query classification
async function classifyQuery(prompt: string): Promise<{ queryType: any; confidence: number }> {
  const promptLower = prompt.toLowerCase();

  // Define patterns for each query type, enhanced for Indian context
  const patterns: Record<QueryType, RegExp[]> = {
    [QueryType.HIGHEST_SALES]: [
      /highest sales/i, /maximum sales/i, /top sales/i, /best( |-)selling/i,
      /highest revenue/i, /peak sales/i, /highest amount/i, /maximum revenue/i,
      /largest bill/i, /biggest transaction/i, /highest invoice/i, /most expensive/i,
      /top earning/i, /top grossing/i, /maximum turnover/i, /max billing/i
    ],
    [QueryType.TOP_PRODUCTS]: [
      /top products/i, /best( |-)selling products/i, /most selling/i, 
      /popular products/i, /trending products/i, /rank.*products/i,
      /highest sold/i, /most demanded items/i, /item popularity/i,
      /fast moving products/i, /hot selling/i, /maximum sold/i,
      /top inventory/i, /most ordered items/i, /leading products/i
    ],
    [QueryType.CITY_ANALYSIS]: [
      /city.*highest/i, /highest.*city/i, /compare cities/i, 
      /sales by city/i, /city-wise/i, /location analysis/i,
      /region wise analysis/i, /area performance/i, /geographic breakdown/i,
      /state wise sales/i, /district performance/i, /zone analysis/i,
      /metro vs non-metro/i, /tier 1 cities/i, /urban vs rural/i
    ],
    [QueryType.TIME_COMPARISON]: [
      /compare.*month/i, /compare.*year/i, /compare.*period/i, 
      /month.*comparison/i, /trend over time/i, /monthly comparison/i,
      /year on year/i, /quarterly comparison/i, /financial year/i,
      /month on month/i, /year to date/i, /mtd comparison/i, /ytd comparison/i,
      /seasonal analysis/i, /festival sales/i, /diwali sales vs regular/i
    ],
    [QueryType.TAX_CALCULATION]: [
      /tax calculation/i, /calculate.*tax/i, /gst.*(amount|calculation)/i, 
      /total tax/i, /tax.*rate/i, /cgst/i, /sgst/i, /igst/i, /tax.*collected/i,
      /taxable amount/i, /tax liability/i, /input tax credit/i, /itc/i,
      /gst payment/i, /tax invoice/i, /gst rates/i, /gst slabs/i,
      /gst percentage/i, /gst filing/i, /gst compliance/i, /hsn code/i,
      /e-way bill/i, /reverse charge/i, /gst return/i, /input credit/i
    ],
    [QueryType.TREND_ANALYSIS]: [
      /trend analysis/i, /growth rate/i, /sales trend/i, 
      /pattern over time/i, /progression/i, /growth pattern/i,
      /sales trajectory/i, /performance curve/i, /market trend/i,
      /growth forecast/i, /demand trajectory/i, /sales movement/i,
      /product lifecycle/i, /rising categories/i, /declining categories/i
    ],
    [QueryType.PRODUCT_INSIGHTS]: [
      /product insights/i, /product performance/i, /declining sales/i, 
      /margin/i, /profit margin/i, /underperforming/i,
      /product profitability/i, /product analytics/i, /high margin items/i,
      /low margin products/i, /profitable products/i, /product contribution/i,
      /product mix/i, /product category performance/i, /dead stock/i
    ],
    [QueryType.SUMMARY_STATISTICS]: [
      /summary/i, /statistics/i, /overview/i, 
      /average/i, /mean/i, /median/i, /summary statistics/i,
      /data synopsis/i, /overall picture/i, /report summary/i,
      /business overview/i, /dashboard metrics/i, /key indicators/i,
      /high level metrics/i, /data highlights/i, /business snapshot/i
    ],
    [QueryType.UNKNOWN]: []
  };

  // Add Indian finance specific terminology that might be used in queries
  // These help classify queries that use Indian finance terminology
  const financialQueryKeywords: Record<string, QueryType> = {
    'rupees': QueryType.HIGHEST_SALES,
    'rupee': QueryType.HIGHEST_SALES,
    'rs': QueryType.HIGHEST_SALES,
    'rs.': QueryType.HIGHEST_SALES,
    'inr': QueryType.HIGHEST_SALES,
    '₹': QueryType.HIGHEST_SALES,
    'turnover': QueryType.HIGHEST_SALES,
    'revenue': QueryType.HIGHEST_SALES,
    'lakhs': QueryType.HIGHEST_SALES,
    'lakh': QueryType.HIGHEST_SALES,
    'crores': QueryType.HIGHEST_SALES,
    'crore': QueryType.HIGHEST_SALES,
    'gst': QueryType.TAX_CALCULATION,
    'cgst': QueryType.TAX_CALCULATION,
    'sgst': QueryType.TAX_CALCULATION,
    'igst': QueryType.TAX_CALCULATION,
    'itc': QueryType.TAX_CALCULATION,
    'tax': QueryType.TAX_CALCULATION,
    'vat': QueryType.TAX_CALCULATION,
    'gstin': QueryType.TAX_CALCULATION,
    'gst registration': QueryType.TAX_CALCULATION,
    'pan': QueryType.TAX_CALCULATION,
    'challan': QueryType.TAX_CALCULATION,
    'invoice': QueryType.HIGHEST_SALES,
    'invoices': QueryType.HIGHEST_SALES,
    'bill': QueryType.HIGHEST_SALES,
    'bills': QueryType.HIGHEST_SALES,
    'receipt': QueryType.HIGHEST_SALES,
    'receipts': QueryType.HIGHEST_SALES,
    'financial year': QueryType.TIME_COMPARISON,
    'fy': QueryType.TIME_COMPARISON,
    'quarter': QueryType.TIME_COMPARISON,
    'q1': QueryType.TIME_COMPARISON,
    'q2': QueryType.TIME_COMPARISON,
    'q3': QueryType.TIME_COMPARISON,
    'q4': QueryType.TIME_COMPARISON,
    'fiscal': QueryType.TIME_COMPARISON
  };

  // Enhanced pattern-based analysis without OpenAI dependency
  console.log("Using enhanced pattern-based analysis for query:", promptLower);
  
  // First, check for common accounting terminology in the query
  // This is particularly important for Indian voucher number queries
  if (promptLower.includes('voucher') || 
      promptLower.includes('vou no') || 
      promptLower.includes('vou no.') || 
      promptLower.includes('vou. no.') || 
      promptLower.includes('vou.no.') || 
      promptLower.includes('vch no') || 
      promptLower.includes('vch no.') || 
      promptLower.includes('v.no') || 
      promptLower.includes('v no')) {
    
    console.log("Detected voucher terminology in query");
    
    // Check if this is a date-specific voucher query
    const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
    
    let detectedMonth = -1;
    for (let i = 0; i < monthNames.length; i++) {
      if (promptLower.includes(monthNames[i])) {
        detectedMonth = i;
        console.log("Detected month in query:", monthNames[i]);
        break;
      }
    }
    
    // Check for year in the query
    const yearMatch = promptLower.match(/\b(20\d{2})\b/);
    let detectedYear = -1;
    if (yearMatch) {
      detectedYear = parseInt(yearMatch[1]);
      console.log("Detected year in query:", detectedYear);
    }
    
    // If we have date information, this is a time-specific query
    if (detectedMonth >= 0 || detectedYear > 0) {
      return {
        queryType: QueryType.TIME_COMPARISON,
        confidence: 0.85
        // Store detected month/year in global state or pass via extraction later
      };
    }
    
    // If no date specifics, this is a general voucher summary query
    return {
      queryType: QueryType.SUMMARY_STATISTICS,
      confidence: 0.75
    };
  }
  
  // Try OpenAI only if specifically enabled and no pattern match was found
  // This is left as a backup but we're primarily using pattern matching now
  try {
    // Skip OpenAI for now as we're strengthening pattern analysis
    /* 
    // Import the OpenAI service directly
    // Using dynamic import to avoid circular dependencies
    const openaiService = await import('./openaiService');
    const { analyzeQuery } = openaiService;

    // Use OpenAI to analyze the query if API key is available
    if (process.env.OPENAI_API_KEY) {
      console.log("Using OpenAI to analyze query:", promptLower);
      
      // Get all available column headers
      const allHeaders = Object.keys(patterns);
      
      // Analyze the query with OpenAI
      const openAIanalysis = await analyzeQuery(prompt, allHeaders);
      
      console.log("OpenAI analysis result:", openAIanalysis);
      
      // If we got a valid result with reasonable confidence, use it
      if (openAIanalysis && openAIanalysis.queryType && openAIanalysis.confidence > 0.4) {
        return { 
          queryType: openAIanalysis.queryType as QueryType, 
          confidence: openAIanalysis.confidence 
        };
      }
    }
    */
  } catch (error) {
    console.error("Error in query analysis:", error);
    // Continue with fallback analysis if any part fails
  }

  // Fallback to pattern-based analysis
  console.log("Using pattern-based analysis for query:", promptLower);
  
  let bestType: string = "UNKNOWN";
  let highestScore = 0;

  // First check for pattern matches
  Object.entries(patterns).forEach(([type, patternList]) => {
    if (type === "UNKNOWN") return;

    // Calculate match score
    const score = patternList.reduce((sum, pattern) => {
      return sum + (pattern.test(promptLower) ? 1 : 0);
    }, 0);

    // Update best match if needed
    if (score > highestScore) {
      highestScore = score;
      bestType = type;
    }
  });

  // If no strong pattern match, look for Indian financial keywords
  if (highestScore === 0) {
    const words = promptLower.split(/\s+/);
    const keywordHits: Record<QueryType, number> = {
      [QueryType.HIGHEST_SALES]: 0,
      [QueryType.TOP_PRODUCTS]: 0,
      [QueryType.CITY_ANALYSIS]: 0,
      [QueryType.TIME_COMPARISON]: 0,
      [QueryType.TAX_CALCULATION]: 0,
      [QueryType.TREND_ANALYSIS]: 0,
      [QueryType.PRODUCT_INSIGHTS]: 0,
      [QueryType.SUMMARY_STATISTICS]: 0,
      [QueryType.UNKNOWN]: 0
    };

    words.forEach(word => {
      const normalizedWord = word.replace(/[,.?!;:'"()]/g, '');
      if (normalizedWord in financialQueryKeywords) {
        const queryType = financialQueryKeywords[normalizedWord];
        keywordHits[queryType]++;
      }
    });

    // Find the category with most hits
    let maxHits = 0;
    Object.entries(keywordHits).forEach(([type, hits]) => {
      if (hits > maxHits) {
        maxHits = hits;
        bestType = type;
        highestScore = hits;
      }
    });
  }

  // Boost confidence for tax-related queries with Indian context
  if (bestType === "TAX_CALCULATION" && 
      /gst|cgst|sgst|igst|tax|vat|gstin/i.test(promptLower)) {
    highestScore += 1;
  }

  // Enhanced detection for voucher number queries
  if (/voucher|vou\.?\s?no\.?|vch\.?\s?no\.?|v\.no|challan/i.test(promptLower)) {
    console.log("Detected voucher number terminology in query");
    bestType = "SUMMARY_STATISTICS";
    highestScore += 2; // Significant boost for Indian voucher terminology
  }

  // Boost confidence for count/amount queries
  if (/how many|count|total number|calculate total/i.test(promptLower)) {
    if (bestType === "HIGHEST_SALES" || bestType === "TOP_PRODUCTS") {
      highestScore += 1;
    }
  }

  // Calculate confidence (0-1) with a higher potential ceiling for better matches
  const confidence = highestScore > 0 ? Math.min(highestScore / 4, 0.95) : 0.4;

  return { queryType: bestType as QueryType, confidence };
}

// Extract entity references from a query
function extractEntityReferences(
  prompt: string,
  data: Record<string, string>[],  headers: string[]
): { 
  specificEntities: string[];
  dateRange: { start?: string; end?: string } | null;
  thresholds: Record<string, number>;
  filters: Record<string, string | number | string[]>;
} {
  const result = {
    specificEntities: [] as string[],
    dateRange: null as { start?: string; end?: string } | null,
    thresholds: {} as Record<string, number>,
    filters: {} as Record<string, string | number | string[]>
  };

  const promptLower = prompt.toLowerCase();

  // Extract specific entities (company names, product names, etc.)
  // First try to find quoted entities
  const quotedEntities = prompt.match(/"([^"]+)"|'([^']+)'/g);
  if (quotedEntities) {
    quotedEntities.forEach(entity => {
      // Remove quotes
      const cleanEntity = entity.replace(/^["']|["']$/g, '');
      result.specificEntities.push(cleanEntity);
    });
  }

  // If no quoted entities, try to find important entities based on data
  if (result.specificEntities.length === 0) {
    // For each distinct value in text columns, check if it appears in the prompt
    const textColumns = headers.filter(header => 
      !promptLower.includes(header.toLowerCase())
    );

    // Extract unique values from text columns
    const uniqueValues = new Set<string>();
    data.forEach(row => {
      textColumns.forEach(col => {
        const value = row[col];
        if (value && value.length > 3) { 
          uniqueValues.add(value);
        }
      });
    });

    // Check if any unique value appears in the prompt
    uniqueValues.forEach(value => {
      if (promptLower.includes(value.toLowerCase())) {
        result.specificEntities.push(value);
      }
    });
  }

  // Extract date ranges
  const dateRangePatterns = [
    // Between date1 and date2
    /between\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+and\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    // From date1 to date2
    /from\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})\s+to\s+(\d{1,2}[-/]\d{1,2}[-/]\d{2,4})/i,
    // Month/period names
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+to\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i,
    // Year ranges
    /(20\d{2})\s+to\s+(20\d{2})/i,
    // Indian date format ranges (dd-mm-yyyy)
    /(\d{1,2}-\d{1,2}-\d{4})\s+to\s+(\d{1,2}-\d{1,2}-\d{4})/i
  ];

  for (const pattern of dateRangePatterns) {
    const match = promptLower.match(pattern);
    if (match) {
      result.dateRange = { start: match[1], end: match[2] };
      break;
    }
  }

  // Extract thresholds (e.g., > 1000, less than 500)
  const thresholdPatterns = [
    /(?:more than|greater than|above|over|>)\s+(\d+(?:,\d+)*(?:\.\d+)?)/i,
    /(?:less than|lower than|below|under|<)\s+(\d+(?:,\d+)*(?:\.\d+)?)/i,
    /(?:at least|minimum|min)\s+(\d+(?:,\d+)*(?:\.\d+)?)/i,
    /(?:at most|maximum|max)\s+(\d+(?:,\d+)*(?:\.\d+)?)/i
  ];

  thresholdPatterns.forEach((pattern, index) => {
    const match = promptLower.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));

      if (index === 0) result.thresholds.min = value;
      else if (index === 1) result.thresholds.max = value;
      else if (index === 2) result.thresholds.min = value;
      else if (index === 3) result.thresholds.max = value;
    }
  });

  // Extract filters (e.g., where city is Mumbai)
  // This is a simplified implementation - a robust solution would use NLP
  headers.forEach(header => {
    const headerLower = header.toLowerCase();
    if (promptLower.includes(headerLower)) {
      // Check for patterns like "where [header] is [value]" or "[header] equals [value]"
      const patterns = [
        new RegExp(`${headerLower}\\s+(?:is|=|equals|equal to)\\s+["']?([\\w\\s]+?)["']?(?:\\s|$|,|\\.)`),
        new RegExp(`${headerLower}\\s+(?:in|contains)\\s+["']?([\\w\\s]+?)["']?(?:\\s|$|,|\\.)`),
        new RegExp(`${headerLower}\\s+(?:starts with|begins with)\\s+["']?([\\w\\s]+?)["']?(?:\\s|$|,|\\.)`),
        new RegExp(`${headerLower}\\s+(?:ends with)\\s+["']?([\\w\\s]+?)["']?(?:\\s|$|,|\\.)`)
      ];

      for (const pattern of patterns) {
        const match = promptLower.match(pattern);
        if (match) {
          result.filters[header] = match[1].trim();
          break;
        }
      }
    }
  });

  return result;
}

// Check if a query is related to counting
function isCountQuery(prompt: string): boolean {
  const countPatterns = [
    /how many/i, /count/i, /total number/i, /find the number/i, 
    /number of/i, /quantity of/i, /sum of/i, /tally/i
  ];

  // Special case for various voucher/invoice terms commonly used in Indian accounting
  const promptLower = prompt.toLowerCase();
  if (
    promptLower.includes('how many') || 
    promptLower.includes('count') || 
    promptLower.includes('total') ||
    promptLower.includes('number of')
  ) {
    return true;
  }

  return countPatterns.some(pattern => pattern.test(prompt));
}

// Check if a query is related to invoices
function isInvoiceQuery(prompt: string): boolean {
  // Special check for Indian voucher terminology
  const promptLower = prompt.toLowerCase();
  
  // Debug invoice patterns
  console.log("Checking if prompt contains voucher/invoice terminology:", promptLower);
  
  // Check for common Indian accounting voucher terminology variations
  if (
    promptLower.includes('vou no') || 
    promptLower.includes('voucher') ||
    promptLower.includes('vou no.') ||
    promptLower.includes('vou. no.') ||
    promptLower.includes('vou.no.') ||
    promptLower.includes('vch no') ||
    promptLower.includes('vch no.') ||
    promptLower.includes('v.no') ||
    promptLower.includes('v no')
  ) {
    console.log("Detected Indian voucher terminology in query");
    return true;
  }
  
  // Regular invoice-related patterns
  const invoicePatterns = [
    /invoice/i, /bill/i, /receipt/i, /challan/i, /voucher/i, 
    /vou[\.|\s]?no/i, /voucher[\.|\s]?no/i, /vch[\.|\s]?no/i,
    /v[\.|\s]?no/i, /vou/i, /vch/i,
    /record/i, /entry/i, /transaction/i
  ];
  
  const patternMatch = invoicePatterns.some(pattern => pattern.test(prompt));
  if (patternMatch) {
    console.log("Detected invoice pattern match in query");
  }
  
  return patternMatch;
}

// Check if a query is related to finances in any way
function isFinancialQuery(prompt: string): boolean {
  const financialPatterns = [
    /invoice/i, /bill/i, /receipt/i, /transaction/i, /tax/i, /gst/i, 
    /amount/i, /payment/i, /money/i, /finance/i, /financial/i, /price/i,
    /revenue/i, /income/i, /expense/i, /sales/i, /purchase/i, /cost/i,
    /profit/i, /balance/i, /account/i, /ledger/i, /credit/i, /debit/i,
    /cash/i, /bank/i, /budget/i, /fiscal/i, /roi/i, /investment/i
  ];

  return financialPatterns.some(pattern => pattern.test(prompt));
}

// Extract date information from a query
function extractDateInfoFromQuery(prompt: string): { targetMonth: number; targetYear: number } {
  const promptLower = prompt.toLowerCase();
  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                      'july', 'august', 'september', 'october', 'november', 'december'];
  
  // Check for specific month in query
  let targetMonth = -1;
  for (let i = 0; i < monthNames.length; i++) {
    if (promptLower.includes(monthNames[i])) {
      targetMonth = i + 1; // 1-based month number
      console.log(`Detected month in query: ${monthNames[i]} (${targetMonth})`);
      break;
    }
  }
  
  // Check for year in query
  const yearMatch = promptLower.match(/\b(20\d{2})\b/);
  let targetYear = -1;
  if (yearMatch) {
    targetYear = parseInt(yearMatch[1]);
    console.log(`Detected year in query: ${targetYear}`);
  }
  
  return { targetMonth, targetYear };
}

// Handle tax query
function handleTaxQuery(
  prompt: string, 
  data: Record<string, string>[], 
  headers: string[], 
  columnTypes: Record<string, string>,
  columnSemanticTypes: Record<string, ColumnSemanticType>,
  entityReferences: any
): string {
  // Find tax-related columns
  const taxColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.TAX ||
    columnSemanticTypes[header] === ColumnSemanticType.TAX_RATE
  );

  // If no tax columns found, look for any other potential columns
  if (taxColumns.length === 0) {
    return `I couldn't find specific tax columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which columns contain tax information?`;
  }

  // Calculate total tax
  let totalTax = 0;
  let taxableAmount = 0;

  // Find tax amount columns
  const taxAmountColumns = taxColumns.filter(column => 
    columnSemanticTypes[column] === ColumnSemanticType.TAX
  );

  // Find amount columns
  const amountColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
  );

  // If we have tax amount columns, sum them up
  if (taxAmountColumns.length > 0) {
    taxAmountColumns.forEach(column => {
      data.forEach(row => {
        const value = row[column].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim();
        if (!isNaN(Number(value)) && value !== '') {
          totalTax += Number(value);
        }
      });
    });
  }

  // If we have amount columns, calculate total taxable amount
  if (amountColumns.length > 0) {
    amountColumns.forEach(column => {
      data.forEach(row => {
        const value = row[column].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim();
        if (!isNaN(Number(value)) && value !== '') {
          taxableAmount += Number(value);
        }
      });
    });
  }

  // Check if the query specifically asks for taxable amount
  if (prompt.toLowerCase().includes('taxable amount') || 
      prompt.toLowerCase().includes('taxable value') ||
      prompt.toLowerCase().includes('tax base')) {
    return `The total taxable amount across all records is ₹${taxableAmount.toFixed(2)}. This includes data from the following amount columns: ${amountColumns.join(', ')}.`;
  }

  // If entity references exist, filter the data
  if (entityReferences.specificEntities.length > 0) {
    const entity = entityReferences.specificEntities[0];
    let entityTax = 0;
    let entityCount = 0;

    // Check for entity in all columns and recalculate tax
    data.forEach(row => {
      let matchesEntity = false;

      // Check if this row contains the entity
      for (const column in row) {
        if (row[column].toLowerCase().includes(entity.toLowerCase())) {
          matchesEntity = true;
          break;
        }
      }

      if (matchesEntity) {
        entityCount++;

        // Sum up taxes for this entity
        taxAmountColumns.forEach(column => {
          const value = row[column].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim();
          if (!isNaN(Number(value)) && value !== '') {
            entityTax += Number(value);
          }
        });
      }
    });

    if (entityCount > 0) {
      return `I found ${entityCount} records related to "${entity}". The total tax amount for these records is ₹${entityTax.toFixed(2)}.`;
    } else {
      return `I couldn't find any records related to "${entity}" in your data.`;
    }
  }

  // Regular tax calculation response
  return `The total tax amount is ₹${totalTax.toFixed(2)}, calculated from the following tax columns: ${taxAmountColumns.join(', ')}. The total taxable value is ₹${taxableAmount.toFixed(2)}.`;
}

// Handle highest sales query
function handleHighestSalesQuery(
  prompt: string, 
  data: Record<string, string>[], 
  headers: string[], 
  columnTypes: Record<string, string>,
  columnSemanticTypes: Record<string, ColumnSemanticType>,
  entityReferences: any
): string {
  // Find amount and quantity columns
  const amountColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
  );

  const quantityColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.QUANTITY
  );

  // If no amount or quantity columns found
  if (amountColumns.length === 0 && quantityColumns.length === 0) {
    return `I couldn't find sales amount or quantity columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which columns contain sales information?`;
  }

  // Determine if we should use amount or quantity based on prompt
  const useAmount = !prompt.toLowerCase().includes('quantity');
  const relevantColumns = useAmount ? amountColumns : quantityColumns;

  if (relevantColumns.length === 0) {
    return `I couldn't find ${useAmount ? 'amount' : 'quantity'} columns in your data. Available columns are: ${headers.join(', ')}.`;
  }

  // Find product column if it exists
  const productColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.PRODUCT
  );

  // Find the highest value
  let highestValue = 0;
  let highestRow: Record<string, string> | null = null;

  relevantColumns.forEach(column => {
    data.forEach(row => {
      const value = parseFloat(row[column].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim());
      if (!isNaN(value) && value > highestValue) {
        highestValue = value;
        highestRow = row;
      }
    });
  });

  if (!highestRow) {
    return `I couldn't find any valid sales ${useAmount ? 'amount' : 'quantity'} values in your data.`;
  }

  // Construct response
  let response = `The highest sales ${useAmount ? 'amount' : 'quantity'} is ${useAmount ? '₹' : ''}${highestValue.toFixed(useAmount ? 2 : 0)}.`;

  // Add product info if available
  if (productColumns.length > 0 && highestRow) {
    response += ` This is for the product "${highestRow[productColumns[0]]}".`;
  }

  // Add date info if available
  const dateColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.DATE
  );

  if (dateColumns.length > 0 && highestRow) {
    response += ` This occurred on ${highestRow[dateColumns[0]]}.`;
  }

  return response;
}

// Handle top products query
function handleTopProductsQuery(
  prompt: string, 
  data: Record<string, string>[], 
  headers: string[], 
  columnTypes: Record<string, string>,
  columnSemanticTypes: Record<string, ColumnSemanticType>,
  entityReferences: any
): string {
  // Find product column
  const productColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.PRODUCT
  );

  if (productColumns.length === 0) {
    return `I couldn't find product columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which column contains product information?`;
  }

  const productColumn = productColumns[0];

  // Find amount and quantity columns
  const amountColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
  );

  const quantityColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.QUANTITY
  );

  // If no amount or quantity columns found
  if (amountColumns.length === 0 && quantityColumns.length === 0) {
    return `I couldn't find sales amount or quantity columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which columns contain sales information?`;
  }

  // Determine if we should use amount or quantity based on prompt
  const useAmount = !prompt.toLowerCase().includes('quantity');
  const relevantColumns = useAmount ? amountColumns : quantityColumns;

  if (relevantColumns.length === 0) {
    return `I couldn't find ${useAmount ? 'amount' : 'quantity'} columns in your data. Available columns are: ${headers.join(', ')}.`;
  }

  const valueColumn = relevantColumns[0];

  // Aggregate data by product
  const productTotals: Record<string, number> = {};

  data.forEach(row => {
    const product = row[productColumn];
    if (!product) return;

    const value = parseFloat(row[valueColumn].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim());
    if (isNaN(value)) return;

    if (!productTotals[product]) {
      productTotals[product] = 0;
    }

    productTotals[product] += value;
  });

  // Sort products by total value
  const sortedProducts = Object.entries(productTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Get top 5

  if (sortedProducts.length === 0) {
    return `I couldn't find any valid product sales data.`;
  }

  // Construct response
  let response = `The top ${Math.min(5, sortedProducts.length)} products by ${useAmount ? 'sales amount' : 'quantity'} are:\n`;

  sortedProducts.forEach((product, index) => {
    response += `${index + 1}. ${product[0]}: ${useAmount ? '₹' : ''}${product[1].toFixed(useAmount ? 2 : 0)}\n`;
  });

  return response;
}

// Handle city analysis query
function handleCityAnalysisQuery(
  prompt: string, 
  data: Record<string, string>[], 
  headers: string[], 
  columnTypes: Record<string, string>,
  columnSemanticTypes: Record<string, ColumnSemanticType>,
  entityReferences: any
): string {
  // Find city column
  const cityColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.CITY
  );

  if (cityColumns.length === 0) {
    return `I couldn't find city columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which column contains city information?`;
  }

  const cityColumn = cityColumns[0];

  // Find amount and quantity columns
  const amountColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
  );

  const quantityColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.QUANTITY
  );

  // If no amount or quantity columns found
  if (amountColumns.length === 0 && quantityColumns.length === 0) {
    return `I couldn't find sales amount or quantity columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which columns contain sales information?`;
  }

  // Determine if we should use amount or quantity based on prompt
  const useAmount = !prompt.toLowerCase().includes('quantity');
  const relevantColumns = useAmount ? amountColumns : quantityColumns;

  if (relevantColumns.length === 0) {
    return `I couldn't find ${useAmount ? 'amount' : 'quantity'} columns in your data. Available columns are: ${headers.join(', ')}.`;
  }

  const valueColumn = relevantColumns[0];

  // Check if analysis is for a specific product
  let specificProduct = null;
  if (entityReferences.specificEntities.length > 0) {
    specificProduct = entityReferences.specificEntities[0];
  }

  // Find product column if needed
  let productColumn = null;
  if (specificProduct) {
    const productColumns = headers.filter(header => 
      columnSemanticTypes[header] === ColumnSemanticType.PRODUCT
    );

    if (productColumns.length > 0) {
      productColumn = productColumns[0];
    }
  }

  // Aggregate data by city
  const cityTotals: Record<string, number> = {};

  data.forEach(row => {
    const city = row[cityColumn];
    if (!city) return;

    // Skip if not matching specific product
    if (specificProduct && productColumn) {
      const product = row[productColumn];
      if (!product || !product.toLowerCase().includes(specificProduct.toLowerCase())) {
        return;
      }
    }

    const value = parseFloat(row[valueColumn].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim());
    if (isNaN(value)) return;

    if (!cityTotals[city]) {
      cityTotals[city] = 0;
    }

    cityTotals[city] += value;
  });

  // Sort cities by total value
  const sortedCities = Object.entries(cityTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // Get top 5

  if (sortedCities.length === 0) {
    return `I couldn't find any valid city sales data${specificProduct ? ` for "${specificProduct}"` : ''}.`;
  }

  // Construct response
  let response = `The top ${Math.min(5, sortedCities.length)} cities by ${useAmount ? 'sales amount' : 'quantity'}${specificProduct ? ` for "${specificProduct}"` : ''} are:\n`;

  sortedCities.forEach((city, index) => {
    response += `${index + 1}. ${city[0]}: ${useAmount ? '₹' : ''}${city[1].toFixed(useAmount ? 2 : 0)}\n`;
  });

  return response;
}

// Handle time comparison query
function handleTimeComparisonQuery(
  prompt: string, 
  data: Record<string, string>[], 
  headers: string[], 
  columnTypes: Record<string, string>,
  columnSemanticTypes: Record<string, ColumnSemanticType>,
  entityReferences: any
): string {
  // Extract date information from the query
  const dateInfo = extractDateInfoFromQuery(prompt);
  const { targetMonth, targetYear } = dateInfo;
  
  // If we have both month and year, this is a voucher count by date query
  const promptLower = prompt.toLowerCase();
  if (targetMonth > 0 && targetYear > 0 && 
     (isCountQuery(prompt) || isInvoiceQuery(prompt) || promptLower.includes('voucher'))) {
    
    // Find date column
    let dateColumn = '';
    for (const header of headers) {
      const headerLower = header.toLowerCase();
      if (headerLower.includes('date') || 
          headerLower === 'dt' || 
          headerLower.includes('vou date') ||
          headerLower.includes('invoice date') ||
          headerLower.includes('bill date')) {
        dateColumn = header;
        console.log(`Found date column: ${header}`);
        break;
      }
    }
    
    // Debug: Print a sample of date values from the CSV
    if (dateColumn && data.length > 0) {
      console.log(`Searching for dates matching month=${targetMonth}, year=${targetYear}`);
      console.log(`Sample date values from CSV (first 5 rows):`);
      data.slice(0, 5).forEach((row, idx) => {
        console.log(`Row ${idx+1}: '${row[dateColumn]}' (${typeof row[dateColumn]})`);
      });
    }
    
    // Find voucher number column
    const voucherColumns = headers.filter(header => {
      const headerLower = header.toLowerCase();
      return headerLower.includes('vou no') || 
             headerLower.includes('voucher') ||
             headerLower === 'vou no.' ||
             headerLower === 'voucher no.' ||
             headerLower === 'vou. no.' ||
             headerLower === 'vou.no.' ||
             headerLower === 'vch no' ||
             headerLower === 'vch no.' ||
             headerLower === 'v.no' ||
             headerLower === 'v no' ||
             columnSemanticTypes[header] === ColumnSemanticType.INVOICE_NUMBER;
    });
    
    const voucherColumn = voucherColumns.length > 0 ? voucherColumns[0] : '';
    
    if (dateColumn || voucherColumn) {
      let matchCount = 0;
      let totalAmount = 0;
      const matchingVouchers: string[] = [];
      
      // Iterate through data and count matches
      data.forEach(row => {
        let isMatch = false;
        
        // If we have a date column, check if it matches target month/year
        if (dateColumn && row[dateColumn]) {
          const dateValue = row[dateColumn];
          
          // Debug the date value
          // console.log(`Checking date value: ${dateValue}`);
          
          // Try different date formats (with special handling for Indian DD/MM/YYYY format)
          if (dateValue.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/)) {
            // Assume DD/MM/YYYY (common in India)
            const parts = dateValue.split(/[\/\-\.]/);
            const month = parseInt(parts[1]);
            const year = parseInt(parts[2]);
            
            // Debug parsed parts
            console.log(`Date format DD/MM/YYYY detected: Parts=${parts.join(',')} → month=${month}, year=${year}`);
            
            if (month === targetMonth && year === targetYear) {
              console.log(`MATCH FOUND: ${dateValue} matches target month=${targetMonth}, year=${targetYear}`);
              isMatch = true;
            }
          } 
          // Also check for MM/DD/YYYY format just in case
          else if (dateValue.match(/\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}/)) {
            const parts = dateValue.split(/[\/\-\.]/);
            const month = parseInt(parts[0]);
            const year = parseInt(parts[2]);
            
            // Debug parsed parts
            console.log(`Date format MM/DD/YYYY detected: Parts=${parts.join(',')} → month=${month}, year=${year}`);
            
            if (month === targetMonth && year === targetYear) {
              console.log(`MATCH FOUND: ${dateValue} matches target month=${targetMonth}, year=${targetYear}`);
              isMatch = true;
            }
          }
          // Also check for YYYY-MM-DD format
          else if (dateValue.match(/\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}/)) {
            const parts = dateValue.split(/[\/\-\.]/);
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]);
            
            // Debug parsed parts
            console.log(`Date format YYYY-MM-DD detected: Parts=${parts.join(',')} → month=${month}, year=${year}`);
            
            if (month === targetMonth && year === targetYear) {
              console.log(`MATCH FOUND: ${dateValue} matches target month=${targetMonth}, year=${targetYear}`);
              isMatch = true;
            }
          }
          // Try to parse as a Date object
          else {
            try {
              const date = new Date(dateValue);
              if (!isNaN(date.getTime())) {
                const month = date.getMonth() + 1; // JS months are 0-indexed
                const year = date.getFullYear();
                
                console.log(`Date object parsed: ${dateValue} → month=${month}, year=${year}`);
                
                if (month === targetMonth && year === targetYear) {
                  console.log(`MATCH FOUND: ${dateValue} matches target month=${targetMonth}, year=${targetYear}`);
                  isMatch = true;
                }
              }
            } catch (e) {
              console.log(`Failed to parse as Date object: ${dateValue}`);
            }
          }
          
          // Also check for text date format like "Feb 2023"
          const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                             'july', 'august', 'september', 'october', 'november', 'december'];
          if (!isMatch && 
              dateValue.toLowerCase().includes(monthNames[targetMonth-1]) && 
              dateValue.includes(targetYear.toString())) {
            console.log(`Text date match found: ${dateValue} contains "${monthNames[targetMonth-1]}" and "${targetYear}"`);
            isMatch = true;
          }
        }
        
        if (isMatch) {
          matchCount++;
          
          // Keep track of voucher numbers if available
          if (voucherColumn && row[voucherColumn]) {
            matchingVouchers.push(row[voucherColumn]);
          }
          
          // If there's an amount column, sum it up
          const amountColumns = headers.filter(header => 
            columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
          );
          
          if (amountColumns.length > 0) {
            // Use the first amount column
            const amountCol = amountColumns[0];
            const amountStr = row[amountCol];
            
            if (amountStr) {
              // Clean up amount string (remove currency symbols, commas)
              const cleanAmount = amountStr.replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim();
              if (!isNaN(Number(cleanAmount)) && cleanAmount !== '') {
                totalAmount += Number(cleanAmount);
              }
            }
          }
        }
      });
      
      // Generate response based on what we found
      const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 
                        'july', 'august', 'september', 'october', 'november', 'december'];
      const monthName = monthNames[targetMonth-1];
      const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);
      
      if (matchCount > 0) {
        let response = `I found ${matchCount} vouchers for ${capitalizedMonth} ${targetYear}`;
        
        // Add amount information if we calculated it
        if (totalAmount > 0) {
          response += ` with a total amount of ₹${totalAmount.toFixed(2)}`;
        }
        
        // Add voucher numbers if there aren't too many
        if (matchingVouchers.length > 0 && matchingVouchers.length <= 5) {
          response += `. Voucher numbers: ${matchingVouchers.join(', ')}`;
        }
        
        return response + '.';
      } else {
        return `I couldn't find any vouchers for ${capitalizedMonth} ${targetYear} in your data.`;
      }
    }
  }
  // Find date column
  const dateColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.DATE
  );

  if (dateColumns.length === 0) {
    return `I couldn't find date columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which column contains date information?`;
  }

  const dateColumn = dateColumns[0];

  // Find amount and quantity columns
  const amountColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
  );

  const quantityColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.QUANTITY
  );

  // If no amount or quantity columns found
  if (amountColumns.length === 0 && quantityColumns.length === 0) {
    return `I couldn't find sales amount or quantity columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which columns contain sales information?`;
  }

  // Determine if we should use amount or quantity based on prompt
  const useAmount = !prompt.toLowerCase().includes('quantity');
  const relevantColumns = useAmount ? amountColumns : quantityColumns;

  if (relevantColumns.length === 0) {
    return `I couldn't find ${useAmount ? 'amount' : 'quantity'} columns in your data. Available columns are: ${headers.join(', ')}.`;
  }

  const valueColumn = relevantColumns[0];

  // Extract months or time periods from data
  const timePeriods = new Set<string>();
  const timeValues: Record<string, number> = {};

  data.forEach(row => {
    const dateStr = row[dateColumn];
    if (!dateStr) return;

    // Try to extract month/year or period
    let period = '';

    // Try different date formats
    try {
      // First try parsing DD/MM/YYYY or MM/DD/YYYY format since these are more common in Indian context
      const dateParts = dateStr.split(/[-/.]/);
      if (dateParts.length >= 3) {
        let month, year;

        // Try DD/MM/YYYY first (common Indian format)
        month = parseInt(dateParts[1]);
        year = parseInt(dateParts[2]);

        // If that doesn't look right, try MM/DD/YYYY
        if (isNaN(month) || month > 12) {
          month = parseInt(dateParts[0]);
          year = parseInt(dateParts[2]);
        }

        // If we have valid month and year, use them
        if (!isNaN(month) && !isNaN(year) && month >= 1 && month <= 12) {
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
          period = `${monthNames[month - 1]} ${year}`;
        }
      }

      // If above failed, try standard date parsing
      if (!period) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const month = date.getMonth() + 1;
          const year = date.getFullYear();
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
          period = `${monthNames[month - 1]} ${year}`;
        }
      }
    } catch (e) {
      // Try another approach - extract just the month name if present
      const monthMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
      if (monthMatch) {
        period = `${monthMatch[1]} ${monthMatch[2]}`;
      }
    }

    // If we couldn't extract a period, skip this row
    if (!period) return;

    timePeriods.add(period);

    const value = parseFloat(row[valueColumn].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim());
    if (isNaN(value)) return;

    if (!timeValues[period]) {
      timeValues[period] = 0;
    }

    timeValues[period] += value;
  });

  if (timePeriods.size < 2) {
    return `I couldn't find enough time periods to make a comparison. Only found: ${Array.from(timePeriods).join(', ')}.`;
  }

  // Sort periods for better presentation
  const sortedPeriods = Array.from(timePeriods).sort();

  // Construct response
  let response = `Here's a comparison of ${useAmount ? 'sales amount' : 'quantity'} across different time periods:\n`;

  sortedPeriods.forEach(period => {
    response += `${period}: ${useAmount ? '₹' : ''}${(timeValues[period] || 0).toFixed(useAmount ? 2 : 0)}\n`;
  });

  // Add insights - compare adjacent periods
  if (sortedPeriods.length >= 2) {
    const firstPeriod = sortedPeriods[0];
    const lastPeriod = sortedPeriods[sortedPeriods.length - 1];

    const firstValue = timeValues[firstPeriod] || 0;
    const lastValue = timeValues[lastPeriod] || 0;

    const percentChange = ((lastValue - firstValue) / firstValue) * 100;

    response += `\nFrom ${firstPeriod} to ${lastPeriod}, there was a ${Math.abs(percentChange).toFixed(2)}% ${percentChange >= 0 ? 'increase' : 'decrease'} in ${useAmount ? 'sales' : 'quantity'}.`;
  }

  return response;
}

// Handle trend analysis query
function handleTrendAnalysisQuery(
  prompt: string, 
  data: Record<string, string>[], 
  headers: string[], 
  columnTypes: Record<string, string>,
  columnSemanticTypes: Record<string, ColumnSemanticType>,
  entityReferences: any
): string {
  // This is similar to time comparison but focuses on trends
  // Find date column
  const dateColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.DATE
  );

  if (dateColumns.length === 0) {
    return `I couldn't find date columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which column contains date information?`;
  }

  const dateColumn = dateColumns[0];

  // Find amount and quantity columns
  const amountColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
  );

  const quantityColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.QUANTITY
  );

  // If no amount or quantity columns found
  if (amountColumns.length === 0 && quantityColumns.length === 0) {
    return `I couldn't find sales amount or quantity columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which columns contain sales information?`;
  }

  // Determine if we should use amount or quantity based on prompt
  const useAmount = !prompt.toLowerCase().includes('quantity');
  const relevantColumns = useAmount ? amountColumns : quantityColumns;

  if (relevantColumns.length === 0) {
    return `I couldn't find ${useAmount ? 'amount' : 'quantity'} columns in your data. Available columns are: ${headers.join(', ')}.`;
  }

  const valueColumn = relevantColumns[0];

  // Extract months or time periods from data
  const timeData: Record<string, number> = {};

  data.forEach(row => {
    const dateStr = row[dateColumn];
    if (!dateStr) return;

    // Try to extract month/year or period
    let period = '';

    // Try different date formats
    try {
      // First try parsing DD/MM/YYYY or MM/DD/YYYY format since these are more common in Indian context
      const dateParts = dateStr.split(/[-/.]/);
      if (dateParts.length >= 3) {
        let month, year;

        // Try DD/MM/YYYY first (common Indian format)
        month = parseInt(dateParts[1]);
        year = parseInt(dateParts[2]);

        // If that doesn't look right, try MM/DD/YYYY
        if (isNaN(month) || month > 12) {
          month = parseInt(dateParts[0]);
          year = parseInt(dateParts[2]);
        }

        // If we have valid month and year, use them
        if (!isNaN(month) && !isNaN(year) && month >= 1 && month <= 12) {
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
          period = `${monthNames[month - 1]} ${year}`;
        }
      }

      // If above failed, try standard date parsing
      if (!period) {
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const month = date.getMonth() + 1;
          const year = date.getFullYear();
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                           'July', 'August', 'September', 'October', 'November', 'December'];
          period = `${monthNames[month - 1]} ${year}`;
        }
      }
    } catch (e) {
      // Try another approach - extract just the month name if present
      const monthMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i);
      if (monthMatch) {
        period = `${monthMatch[1]} ${monthMatch[2]}`;
      }
    }

    // If we couldn't extract a period, skip this row
    if (!period) return;

    const value = parseFloat(row[valueColumn].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim());
    if (isNaN(value)) return;

    if (!timeData[period]) {
      timeData[period] = 0;
    }

    timeData[period] += value;
  });

  if (Object.keys(timeData).length < 3) {
    return `I couldn't find enough time periods to analyze the trend. Found only: ${Object.keys(timeData).join(', ')}.`;
  }

  // Sort periods for trend analysis
  const sortedPeriods = Object.keys(timeData).sort();
  const sortedValues = sortedPeriods.map(period => timeData[period]);

  // Calculate trend
  let trend = '';

  // Determine if trend is increasing, decreasing, or fluctuating
  let increasing = true;
  let decreasing = true;

  for (let i = 1; i < sortedValues.length; i++) {
    if (sortedValues[i] < sortedValues[i - 1]) {
      increasing = false;
    }
    if (sortedValues[i] > sortedValues[i - 1]) {
      decreasing = false;
    }
  }

  if (increasing) {
    trend = 'consistently increasing';
  } else if (decreasing) {
    trend = 'consistently decreasing';
  } else {
    // Check if overall trend is up or down
    const firstValue = sortedValues[0];
    const lastValue = sortedValues[sortedValues.length - 1];

    if (lastValue > firstValue) {
      trend = 'fluctuating but generally increasing';
    } else if (lastValue < firstValue) {
      trend = 'fluctuating but generally decreasing';
    } else {
      trend = 'fluctuating with no clear direction';
    }
  }

  // Calculate growth rate
  const firstValue = sortedValues[0];
  const lastValue = sortedValues[sortedValues.length - 1];
  const totalGrowthRate = ((lastValue - firstValue) / firstValue) * 100;

  // Construct response
  let response = `Trend Analysis for ${useAmount ? 'Sales Amount' : 'Quantity'} over ${sortedPeriods.length} time periods:\n\n`;

  sortedPeriods.forEach((period, index) => {
    response += `${period}: ${useAmount ? '₹' : ''}${timeData[period].toFixed(useAmount ? 2 : 0)}`;

    // Add period-over-period growth rate
    if (index > 0) {
      const previousValue = timeData[sortedPeriods[index - 1]];
      const currentValue = timeData[period];
      const growthRate = ((currentValue - previousValue) / previousValue) * 100;

      response += ` (${growthRate >= 0 ? '+' : ''}${growthRate.toFixed(2)}%)`;
    }

    response += '\n';
  });

  response += `\nOverall trend: ${trend}`;
  response += `\nTotal growth from ${sortedPeriods[0]} to ${sortedPeriods[sortedPeriods.length - 1]}: ${totalGrowthRate >= 0 ? '+' : ''}${totalGrowthRate.toFixed(2)}%`;

  // Add seasonality insights if applicable
  if (sortedPeriods.length >= 6) {
    response += '\n\nPossible seasonal patterns:';

    // Find peaks (highest values)
    const indexedValues = sortedValues.map((value, index) => ({ value, index }));
    const peakPeriods = indexedValues
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map(item => sortedPeriods[item.index]);

    if (peakPeriods.length > 0) {
      response += `\nPeak periods: ${peakPeriods.join(', ')}`;
    }
  }

  return response;
}

// Handle product insights query
function handleProductInsightsQuery(
  prompt: string, 
  data: Record<string, string>[], 
  headers: string[], 
  columnTypes: Record<string, string>,
  columnSemanticTypes: Record<string, ColumnSemanticType>,
  entityReferences: any
): string {
  // Find product column
  const productColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.PRODUCT
  );

  if (productColumns.length === 0) {
    return `I couldn't find product columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which column contains product information?`;
  }

  const productColumn = productColumns[0];

  // Find amount and quantity columns
  const amountColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
  );

  const quantityColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.QUANTITY
  );

  // If no amount or quantity columns found
  if (amountColumns.length === 0 && quantityColumns.length === 0) {
    return `I couldn't find sales amount or quantity columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which columns contain sales information?`;
  }

  // Determine if we should use amount or quantity based on prompt
  const useAmount = !prompt.toLowerCase().includes('quantity');
  const relevantColumns = useAmount ? amountColumns : quantityColumns;

  if (relevantColumns.length === 0) {
    return `I couldn't find ${useAmount ? 'amount' : 'quantity'} columns in your data. Available columns are: ${headers.join(', ')}.`;
  }

  const valueColumn = relevantColumns[0];

  // Find date column if it exists
  const dateColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.DATE
  );

  const dateColumn = dateColumns.length > 0 ? dateColumns[0] : null;

  // Aggregate data by product
  const productTotals: Record<string, number> = {};
  const products = new Set<string>();

  // For trend analysis if date column exists
  const productTimeData: Record<string, Record<string, number>> = {};

  data.forEach(row => {
    const product = row[productColumn];
    if (!product) return;

    products.add(product);

    const value = parseFloat(row[valueColumn].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim());
    if (isNaN(value)) return;

    if (!productTotals[product]) {
      productTotals[product] = 0;
    }

    productTotals[product] += value;

    // If date column exists, track product performance over time
    if (dateColumn) {
      const dateStr = row[dateColumn];
      if (!dateStr) return;

      // Extract period (month/year)
      let period = '';
      try {
        const dateParts = dateStr.split(/[-/]/);
        if (dateParts.length >= 3) {
          // Assume it's DD/MM/YYYY format (common in India)
          const month = parseInt(dateParts[1]);
          const year = parseInt(dateParts[2]);
          if (!isNaN(month) && !isNaN(year)) {
            period = `${month}/${year}`;
          }
        }
      } catch (e) {
        // Skip this row if period can't be determined
        return;
      }

      if (!period) return;

      if (!productTimeData[product]) {
        productTimeData[product] = {};
      }

      if (!productTimeData[product][period]) {
        productTimeData[product][period] = 0;
      }

      productTimeData[product][period] += value;
    }
  });

  // Sort products by total value
  const sortedProducts = Object.entries(productTotals)
    .sort((a, b) => b[1] - a[1]);

  if (sortedProducts.length === 0) {
    return `I couldn't find any valid product sales data.`;
  }

  // Identify declining products if date info is available
  const decliningProducts: string[] = [];

  if (dateColumn && Object.keys(productTimeData).length > 0) {
    // For each product, check if sales are declining
    Object.entries(productTimeData).forEach(([product, timeSeries]) => {
      const periods = Object.keys(timeSeries).sort();

      if (periods.length >= 3) {
        // Check the last 3 periods
        const last3Periods = periods.slice(-3);
        const values = last3Periods.map(p => timeSeries[p]);

        // If values are consistently decreasing
        if (values[0] > values[1] && values[1] > values[2]) {
          decliningProducts.push(product);
        }
      }
    });
  }

  // Construct response
  let response = `Product Insights Analysis:\n\n`;

  // Top performing products
  const topProducts = sortedProducts.slice(0, 5);
  response += `Top 5 Performing Products:\n`;
  topProducts.forEach((product, index) => {
    response += `${index + 1}. ${product[0]}: ${useAmount ? '₹' : ''}${product[1].toFixed(useAmount ? 2 : 0)}\n`;
  });

  // Bottom performing products
  const bottomProducts = sortedProducts.slice(-5).reverse();
  response += `\nBottom 5 Performing Products:\n`;
  bottomProducts.forEach((product, index) => {
    response += `${index + 1}. ${product[0]}: ${useAmount ? '₹' : ''}${product[1].toFixed(useAmount ? 2 : 0)}\n`;
  });

  // Declining products
  if (decliningProducts.length > 0) {
    response += `\nProducts with Declining Sales Trend:\n`;
    decliningProducts.slice(0, 5).forEach((product, index) => {
      response += `${index + 1}. ${product}\n`;
    });
  }

  // Overall statistics
  const totalProducts = products.size;
  const totalValue = Object.values(productTotals).reduce((sum, value) => sum + value, 0);
  const avgValue = totalValue / totalProducts;

  response += `\nSummary Statistics:\n`;
  response += `- Total Products: ${totalProducts}\n`;
  response += `- Total ${useAmount ? 'Sales' : 'Quantity'}: ${useAmount ? '₹' : ''}${totalValue.toFixed(useAmount ? 2 : 0)}\n`;
  response += `- Average ${useAmount ? 'Sales' : 'Quantity'} per Product: ${useAmount ? '₹' : ''}${avgValue.toFixed(useAmount ? 2 : 0)}\n`;

  return response;
}

// Handle summary statistics query
function handleSummaryStatisticsQuery(
  prompt: string, 
  data: Record<string, string>[], 
  headers: string[], 
  columnTypes: Record<string, string>,
  columnSemanticTypes: Record<string, ColumnSemanticType>,
  entityReferences: any
): string {
  // Find numeric columns
  const numericColumns = headers.filter(header => 
    columnTypes[header] === 'numeric'
  );

  if (numericColumns.length === 0) {
    return `I couldn't find numeric columns in your data for statistical analysis. The available columns are: ${headers.join(', ')}.`;
  }

  // Calculate statistics for each numeric column
  const statistics: Record<string, any> = {};

  numericColumns.forEach(column => {
    // Extract valid numeric values
    const values = data
      .map(row => {
        const value = row[column].replace(/,/g, '').replace(/₹/g, '').replace(/Rs\./i, '').trim();
        return parseFloat(value);
      })
      .filter(value => !isNaN(value));

    if (values.length === 0) return;

    // Sort values for percentile calculations
    const sortedValues = [...values].sort((a, b) => a - b);

    // Calculate basic statistics
    const sum = values.reduce((total, val) => total + val, 0);
    const mean = sum / values.length;

    // Calculate median
    let median;
    const mid = Math.floor(sortedValues.length / 2);
    if (sortedValues.length % 2 === 0) {
      median = (sortedValues[mid - 1] + sortedValues[mid]) / 2;
    } else {
      median = sortedValues[mid];
    }

    // Calculate standard deviation
    const variance = values.reduce((total, val) => total + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    // Calculate quartiles
    const q1Index = Math.floor(sortedValues.length * 0.25);
    const q3Index = Math.floor(sortedValues.length * 0.75);
    const q1 = sortedValues[q1Index];
    const q3 = sortedValues[q3Index];

    statistics[column] = {
      count: values.length,
      min: sortedValues[0],
      max: sortedValues[sortedValues.length - 1],
      sum,
      mean,
      median,
      stdDev,
      q1,
      q3
    };
  });

  // If there are no valid statistics
  if (Object.keys(statistics).length === 0) {
    return `I couldn't calculate statistics from your data. Please check if your numeric columns contain valid numbers.`;
  }

  // Determine column semantics for better reporting
  const amountColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
  );

  const quantityColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.QUANTITY
  );

  const taxColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.TAX ||
    columnSemanticTypes[header] === ColumnSemanticType.TAX_RATE
  );

  // Construct response
  let response = `Summary Statistics:\n\n`;

  // Basic dataset information
  response += `Dataset Information:\n`;
  response += `- Total Records: ${data.length}\n`;
  response += `- Total Columns: ${headers.length}\n`;
  response += `- Numeric Columns: ${numericColumns.length}\n\n`;

  // Focus on key columns first
  const priorityColumns = [...amountColumns, ...quantityColumns, ...taxColumns];
  const remainingColumns = numericColumns.filter(col => !priorityColumns.includes(col));
  const columnsToProcess = [...priorityColumns, ...remainingColumns];

  // Report detailed statistics for each column
  columnsToProcess.forEach(column => {
    if (!statistics[column]) return;

    const stats = statistics[column];
    const isCurrency = columnSemanticTypes[column] === ColumnSemanticType.AMOUNT || 
                      columnSemanticTypes[column] === ColumnSemanticType.TAX;

    response += `${column} Statistics:\n`;
    response += `- Count: ${stats.count}\n`;
    response += `- Minimum: ${isCurrency ? '₹' : ''}${stats.min.toFixed(isCurrency ? 2 : 2)}\n`;
    response += `- Maximum: ${isCurrency ? '₹' : ''}${stats.max.toFixed(isCurrency ? 2 : 2)}\n`;
    response += `- Sum: ${isCurrency ? '₹' : ''}${stats.sum.toFixed(isCurrency ? 2 : 2)}\n`;
    response += `- Mean (Average): ${isCurrency ? '₹' : ''}${stats.mean.toFixed(isCurrency ? 2 : 2)}\n`;
    response += `- Median: ${isCurrency ? '₹' : ''}${stats.median.toFixed(isCurrency ? 2 : 2)}\n`;
    response += `- Standard Deviation: ${isCurrency ? '₹' : ''}${stats.stdDev.toFixed(isCurrency ? 2 : 2)}\n`;
    response += `- 1st Quartile (25%): ${isCurrency ? '₹' : ''}${stats.q1.toFixed(isCurrency ? 2 : 2)}\n`;
    response += `- 3rd Quartile (75%): ${isCurrency ? '₹' : ''}${stats.q3.toFixed(isCurrency ? 2 : 2)}\n\n`;
  });

  return response;
}

// Default response when no specific query type is identified
function generateDefaultResponse(
  data: Record<string, string>[], 
  headers: string[], 
  columnTypes: Record<string, string>,
  columnSemanticTypes: Record<string, ColumnSemanticType>
): string {
  const rowCount = data.length;

  // Identify key column types
  const amountColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.AMOUNT
  );

  const taxColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.TAX ||
    columnSemanticTypes[header] === ColumnSemanticType.TAX_RATE
  );

  const dateColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.DATE
  );

  const productColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.PRODUCT
  );

  const invoiceColumns = headers.filter(header => 
    columnSemanticTypes[header] === ColumnSemanticType.INVOICE_NUMBER
  );

  // Generate enhanced default response
  let response = `I've analyzed your CSV data with ${rowCount} rows and ${headers.length} columns.\n\n`;

  // Add information about key column types
  response += 'I identified the following column types:\n';

  if (amountColumns.length > 0) {
    response += `- Amount/Value columns: ${amountColumns.join(', ')}\n`;
  }

  if (taxColumns.length > 0) {
    response += `- Tax-related columns: ${taxColumns.join(', ')}\n`;
  }

  if (dateColumns.length > 0) {
    response += `- Date columns: ${dateColumns.join(', ')}\n`;
  }

  if (productColumns.length > 0) {
    response += `- Product columns: ${productColumns.join(', ')}\n`;
  }

  if (invoiceColumns.length > 0) {
    response += `- Invoice/Bill Number columns: ${invoiceColumns.join(', ')}\n`;
  }

  // Add suggestion for queries
  response += `\nYou can ask me specific questions about this data, such as:\n`;
  response += `- "How many invoices are there?"\n`;
  response += `- "Calculate total tax amount"\n`;
  response += `- "What are the top selling products?"\n`;
  response += `- "Show monthly sales trend"\n`;
  response += `- "Analyze sales by city"\n`;
  response += `- "Find products with declining sales"\n`;
  response += `- "Compare sales between months"\n`;
  response += `- "Give me a summary of tax data"\n`;

  return response;
}