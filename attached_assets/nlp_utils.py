import os
import pandas as pd
import numpy as np
import requests
import json
import logging
import re
from django.conf import settings
from rapidfuzz import process, fuzz
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple, Union
import hashlib
from functools import lru_cache
# Try to import sentence-transformers, but continue without it if not available
try:
    from sentence_transformers import SentenceTransformer
    SENTENCE_TRANSFORMERS_AVAILABLE = True
except ImportError:
    logger = logging.getLogger(__name__)
    logger.warning("sentence-transformers package not available. Using fallback similarity methods.")
    SENTENCE_TRANSFORMERS_AVAILABLE = False

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.pipeline import Pipeline

logger = logging.getLogger(__name__)

# Load sentence transformer model for semantic similarity only if available
embedding_model = None
if SENTENCE_TRANSFORMERS_AVAILABLE:
    try:
        embedding_model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        logger.info("Sentence transformer model loaded successfully")
    except Exception as e:
        logger.error(f"Error loading embedding model: {str(e)}")
        embedding_model = None

# Query type definitions for classifier training
QUERY_TYPES = {
    "highest_sales": [
        "What's the highest sales in quantity for January?",
        "Show me the highest amount of sales last month",
        "Which product had the highest sales in quantity?",
        "What was our best-selling item by revenue?",
        "Find the maximum sales figure in the dataset",
        "What is the peak sales value?",
        "Show highest revenue product"
    ],
    "top_products": [
        "What are the most selling products last month?",
        "Show me the top 3 products by sales",
        "Which items sold the most in March?",
        "List the best-performing products by quantity",
        "What products had the highest sales volume?",
        "Rank products by revenue",
        "Which products are trending?"
    ],
    "city_analysis": [
        "Which city has the highest sales of product X?",
        "Show me the top 3 cities with highest amount of sales for product Y",
        "What areas are selling the most of our premium products?",
        "Rank cities by total sales volume",
        "Where are we selling the most units of Z?",
        "Compare sales between cities",
        "Show city-wise breakdown"
    ],
    "time_comparison": [
        "Compare sales between January and February",
        "How did last month's sales compare to the previous month?",
        "Show me month-over-month growth in sales",
        "Which month had better performance for product X?",
        "What's the trend in sales over the last quarter?",
        "Show yearly comparison",
        "Compare quarterly performance"
    ],
    "tax_calculation": [
        "Calculate total tax at 18% for all sales",
        "What's the GST amount for transactions with 12% tax rate?",
        "Sum all tax amounts in the dataset",
        "How much VAT did we collect at 20%?",
        "Calculate tax liability for all sales in Q1",
        "Show CGST and SGST breakup",
        "Total tax collected",
        "What is the total taxable amount",
        "Sum of all taxable amounts",
        "Total taxable amount",
        "Taxable amount sum",
        "Add up all taxable amounts",
        "Total tax base",
        "Sum of taxable values"
    ],
    "trend_analysis": [
        "Show me the sales trend over the last 6 months",
        "What's the growth rate of product X?",
        "Plot the monthly sales progression",
        "How are sales trending this quarter?",
        "Compare year-over-year performance",
        "Show growth patterns",
        "Identify seasonal trends"
    ],
    "product_insights": [
        "Which products have declining sales?",
        "Show me products with stock below threshold",
        "What's the profit margin for each product?",
        "Which products are seasonal?",
        "Identify top performing product categories",
        "Show product performance metrics",
        "List underperforming items"
    ],
    "summary_statistics": [
        "Give me a summary of the sales data",
        "Show basic statistics of the dataset",
        "What are the average sales per month?",
        "Calculate mean and median sales",
        "Show data distribution",
        "Summarize quarterly performance"
    ]
}

# Build and initialize query classifier
def build_query_classifier():
    """Build a classifier for query types"""
    try:
        X_train = []
        y_train = []
        
        for query_type, examples in QUERY_TYPES.items():
            for example in examples:
                X_train.append(example)
                y_train.append(query_type)
        
        classifier = Pipeline([
            ('tfidf', TfidfVectorizer(ngram_range=(1, 2))),
            ('clf', MultinomialNB())
        ])
        
        classifier.fit(X_train, y_train)
        logger.info(f"Query classifier built with {len(X_train)} training examples")
        return classifier
    except Exception as e:
        logger.error(f"Error building query classifier: {str(e)}")
        return None

# Initialize the classifier
query_classifier = build_query_classifier()

def extract_text_from_csv(file) -> pd.DataFrame:
    """
    Extract and parse a CSV file, returning a pandas DataFrame
    """
    try:
        file.seek(0)  # Reset file pointer
        
        # Try different encodings
        encodings = ['utf-8', 'latin1', 'iso-8859-1']
        df = None
        
        for encoding in encodings:
            try:
                file.seek(0)
                df = pd.read_csv(file, encoding=encoding)
                break
            except UnicodeDecodeError:
                continue
        
        if df is None:
            raise ValueError("Could not decode the CSV file with supported encodings")
            
        # Clean column names
        df.columns = [col.strip() for col in df.columns]
        
        # Convert date columns
        for col in df.columns:
            # Check if column name suggests it's a date
            if any(date_term in col.lower() for date_term in ['date', 'time', 'day', 'month', 'year']):
                try:
                    df[col] = pd.to_datetime(df[col], errors='ignore')
                except:
                    pass
                    
        logger.info(f"CSV file processed successfully: {df.shape[0]} rows, {df.shape[1]} columns")
        return df
        
    except Exception as e:
        logger.error(f"Error extracting text from CSV: {str(e)}", exc_info=True)
        raise ValueError(f"Error processing CSV file: {str(e)}")

def validate_csv_data(df) -> Dict[str, List[str]]:
    """
    Validate the structure and content of the uploaded CSV file
    """
    validation_results = {"errors": [], "warnings": []}
    
    if df.empty:
        validation_results["errors"].append("The CSV file is empty.")
        return validation_results
        
    # Check if there are enough rows for meaningful analysis
    if len(df) < 2:
        validation_results["errors"].append("The CSV file contains too few rows for analysis.")
        
    # Check if there are at least some columns
    if len(df.columns) < 2:
        validation_results["warnings"].append("The CSV file contains only one column, which may limit analysis.")
        
    # Check for empty/null values
    null_counts = df.isnull().sum()
    high_null_cols = [col for col, count in null_counts.items() if count > len(df) * 0.5]
    if high_null_cols:
        validation_results["warnings"].append(
            f"The following columns have more than 50% missing values: {', '.join(high_null_cols)}"
        )
        
    # Check column types - at least one numeric column for analysis
    numeric_cols = df.select_dtypes(include=['number']).columns.tolist()
    if not numeric_cols:
        validation_results["warnings"].append(
            "No numeric columns found, which may limit quantitative analysis."
        )
        
    logger.info(f"CSV validation completed: {len(validation_results['errors'])} errors, {len(validation_results['warnings'])} warnings")
    return validation_results

def analyze_csv_data(df, prompt) -> Dict[str, Any]:
    """
    Perform comprehensive analysis of CSV data based on user prompt
    """
    try:
        # Classify query to understand user intent
        query_classification = classify_query(prompt, df)
        
        # Analyze column types and structures
        column_types = {}
        for col in df.columns:
            if pd.api.types.is_numeric_dtype(df[col]):
                column_types[col] = "numeric"
            elif pd.api.types.is_datetime64_dtype(df[col]):
                column_types[col] = "datetime"
            else:
                column_types[col] = "categorical"
                
        # Generate basic statistics for numeric columns
        numeric_stats = {}
        for col in df.select_dtypes(include=['number']).columns:
            numeric_stats[col] = {
                "min": float(df[col].min()),
                "max": float(df[col].max()),
                "mean": float(df[col].mean()),
                "median": float(df[col].median()),
                "std": float(df[col].std())
            }
            
        # Extract potential date columns for time-based analysis
        date_columns = []
        for col in df.columns:
            if pd.api.types.is_datetime64_dtype(df[col]):
                date_columns.append(col)
            elif "date" in col.lower() or "time" in col.lower():
                try:
                    # Try to convert to datetime
                    pd.to_datetime(df[col])
                    date_columns.append(col)
                except:
                    pass
                    
        # Add entity extraction functionality
        entity_refs = extract_entity_references(prompt, df)
        
        # Perform specific analysis based on query type
        specific_analysis = {}
        query_type = query_classification.get("query_type")
        
        if query_type == "tax_calculation":
            # Add entity references to the query classification
            query_classification["entity_refs"] = entity_refs
            
            # Find columns likely containing taxable amounts or tax related data
            tax_cols = [col for col in df.columns if any(term in col.lower() for term in 
                      ["tax", "taxable", "gst", "cgst", "sgst", "igst", "vat"])]
            
            # Additional check for columns with "amt" in the name
            amt_cols = [col for col in df.columns if any(term in col.lower() for term in 
                      ["amt", "amount"])]
            
            # Combine tax_cols and amt_cols, removing duplicates
            all_potential_cols = list(set(tax_cols + amt_cols))
            
            # Check if we have an entity-specific tax query
            entity_filter = None
            if entity_refs.get("specific_entities") and entity_refs.get("filters"):
                # We have specific entities mentioned (like "Nikhil Ceramics")
                entity_filter = entity_refs.get("filters")
                entity_name = entity_refs.get("specific_entities")[0]
                
                # Add entity info to specific analysis
                specific_analysis["entity_query"] = {
                    "entity": entity_name,
                    "filter_column": list(entity_filter.keys())[0] if entity_filter else None,
                    "filter_value": list(entity_filter.values())[0] if entity_filter else None
                }
                
                # If we have entity-specific tax totals from entity extraction, add them directly
                if "entity_tax_total" in entity_refs:
                    specific_analysis["entity_tax_total"] = entity_refs["entity_tax_total"]
            
            # If we found potential tax columns
            if all_potential_cols:
                for col in all_potential_cols:
                    # Convert string columns to numeric if they appear to contain numbers
                    if not pd.api.types.is_numeric_dtype(df[col]):
                        try:
                            # Make a copy to avoid modifying the original
                            numeric_col = df[col].copy()
                            # Try to convert potential string numbers (with commas, currency symbols, etc.)
                            numeric_col = numeric_col.astype(str).replace('[\$,₹,£,€]', '', regex=True)
                            numeric_col = numeric_col.replace(',', '', regex=True)
                            numeric_col = pd.to_numeric(numeric_col, errors='coerce')
                            
                            # Only assign back if conversion was successful for a significant portion
                            if numeric_col.notna().sum() > 0.5 * len(numeric_col):
                                # Create a temporary copy for calculations but don't modify original
                                df_temp = df.copy()
                                df_temp[col] = numeric_col
                                
                                # Calculate sum and other stats
                                col_sum = numeric_col.fillna(0).sum()
                                specific_analysis[f"total_{col}"] = {
                                    "column": col,
                                    "total": float(col_sum),
                                    "avg_per_row": float(col_sum / len(df)) if len(df) > 0 else 0,
                                    "min": float(numeric_col.min()),
                                    "max": float(numeric_col.max()),
                                    "currency": "₹"  # Explicitly set currency as Indian Rupees
                                }
                            else:
                                logger.warning(f"Column {col} doesn't appear to contain mostly numeric data")
                        except Exception as e:
                            logger.warning(f"Could not convert column {col} to numeric: {str(e)}")
                    
                    # If it's already numeric, calculate sum
                    elif pd.api.types.is_numeric_dtype(df[col]):
                        # Remove NaN values for the calculation
                        col_sum = df[col].fillna(0).sum()
                        specific_analysis[f"total_{col}"] = {
                            "column": col,
                            "total": float(col_sum),
                            "avg_per_row": float(col_sum / len(df)) if len(df) > 0 else 0,
                            "min": float(df[col].min()),
                            "max": float(df[col].max()),
                            "currency": "₹"  # Explicitly set currency as Indian Rupees
                        }
            
            # If no tax columns found, try to find amount columns that might be taxable
            else:
                amount_cols = [col for col in df.columns if any(term in col.lower() for term in 
                             ["amount", "value", "price", "total", "sum"])]
                
                for col in amount_cols:
                    # Try to convert to numeric similar to above
                    if not pd.api.types.is_numeric_dtype(df[col]):
                        try:
                            # Make a copy to avoid modifying the original
                            numeric_col = df[col].copy()
                            # Try to convert potential string numbers (with commas, currency symbols, etc.)
                            numeric_col = numeric_col.astype(str).replace('[\$,₹,£,€]', '', regex=True)
                            numeric_col = numeric_col.replace(',', '', regex=True)
                            numeric_col = pd.to_numeric(numeric_col, errors='coerce')
                            
                            # Only assign back if conversion was successful for a significant portion
                            if numeric_col.notna().sum() > 0.5 * len(numeric_col):
                                # Create a temporary copy for calculations but don't modify original
                                df_temp = df.copy()
                                df_temp[col] = numeric_col
                                
                                # Calculate sum and other stats
                                col_sum = numeric_col.fillna(0).sum()
                                specific_analysis[f"total_{col}"] = {
                                    "column": col,
                                    "total": float(col_sum),
                                    "avg_per_row": float(col_sum / len(df)) if len(df) > 0 else 0,
                                    "min": float(numeric_col.min()),
                                    "max": float(numeric_col.max()),
                                    "currency": "₹"  # Explicitly set currency as Indian Rupees
                                }
                            else:
                                logger.warning(f"Column {col} doesn't appear to contain mostly numeric data")
                        except Exception as e:
                            logger.warning(f"Could not convert column {col} to numeric: {str(e)}")
                    
                    # If it's already numeric, calculate sum
                    elif pd.api.types.is_numeric_dtype(df[col]):
                        # Remove NaN values for the calculation
                        col_sum = df[col].fillna(0).sum()
                        specific_analysis[f"total_{col}"] = {
                            "column": col,
                            "total": float(col_sum),
                            "avg_per_row": float(col_sum / len(df)) if len(df) > 0 else 0,
                            "min": float(df[col].min()),
                            "max": float(df[col].max()),
                            "currency": "₹"  # Explicitly set currency as Indian Rupees
                        }
                        
        elif query_type == "highest_sales":
            # Find columns likely containing sales data
            sales_cols = [col for col in df.columns if any(term in col.lower() for term in 
                         ["sales", "revenue", "amount", "quantity", "total"])]
            
            if sales_cols:
                for col in sales_cols:
                    if pd.api.types.is_numeric_dtype(df[col]):
                        specific_analysis[f"highest_{col}"] = {
                            "value": float(df[col].max()),
                            "row": df.loc[df[col].idxmax()].to_dict()
                        }
                        
        elif query_type == "top_products":
            # Find product and sales columns
            product_cols = [col for col in df.columns if any(term in col.lower() for term in 
                           ["product", "item", "sku", "name"])]
            sales_cols = [col for col in df.columns if any(term in col.lower() for term in 
                         ["sales", "revenue", "amount", "quantity"])]
            
            if product_cols and sales_cols:
                product_col = product_cols[0]
                sales_col = sales_cols[0]
                
                # Get top 5 products by sales
                top_products = df.groupby(product_col)[sales_col].sum().sort_values(ascending=False).head(5)
                specific_analysis["top_products"] = {
                    "column": product_col,
                    "metric": sales_col,
                    "results": top_products.to_dict()
                }
                
        elif query_type == "city_analysis" or query_type == "geo_analysis":
            # Find location and sales columns
            location_cols = [col for col in df.columns if any(term in col.lower() for term in 
                            ["city", "region", "country", "location", "area", "state"])]
            sales_cols = [col for col in df.columns if any(term in col.lower() for term in 
                         ["sales", "revenue", "amount", "quantity"])]
            
            if location_cols and sales_cols:
                location_col = location_cols[0]
                sales_col = sales_cols[0]
                
                # Get sales by location
                location_sales = df.groupby(location_col)[sales_col].sum().sort_values(ascending=False)
                specific_analysis["location_sales"] = {
                    "location_column": location_col,
                    "metric": sales_col,
                    "results": location_sales.head(10).to_dict()
                }
                
        logger.info(f"CSV analysis completed for query type: {query_type}")
        
        return {
            "query_classification": query_classification,
            "column_types": column_types,
            "numeric_stats": numeric_stats,
            "date_columns": date_columns,
            "specific_analysis": specific_analysis
        }
        
    except Exception as e:
        logger.error(f"Error analyzing CSV data: {str(e)}", exc_info=True)
        return {
            "error": f"Error analyzing CSV data: {str(e)}",
            "column_types": {},
            "query_classification": {"query_type": "unknown"}
        }

def classify_query(prompt: str, df: pd.DataFrame) -> Dict[str, Any]:
    """
    Enhanced query classification to determine query type and extract entities
    """
    try:
        prompt_lower = prompt.lower()
        result = {
            "query_type": "unknown",
            "target_column": None,
            "target_entity": None,
            "time_range": None
        }
        
        # Use the trained classifier if available
        if query_classifier:
            predicted_type = query_classifier.predict([prompt])[0]
            confidence = np.max(query_classifier.predict_proba([prompt])[0])
            
            if confidence > 0.3:
                result["query_type"] = predicted_type
                result["confidence"] = float(confidence)
                logger.info(f"Query classified as '{predicted_type}' with confidence {confidence:.2f}")
            
        # Direct pattern matching as fallback or supplement
        if result["query_type"] == "unknown":
            for query_type, patterns in QUERY_TYPES.items():
                for pattern in patterns:
                    similarity = compute_similarity(prompt_lower, pattern.lower())
                    if similarity > 0.7:
                        result["query_type"] = query_type
                        result["confidence"] = float(similarity)
                        logger.info(f"Query matched to '{query_type}' with similarity {similarity:.2f}")
                        break
                        
        # Extract target column using fuzzy matching
        df_columns = [col.lower() for col in df.columns]
        for col in df.columns:
            col_lower = col.lower()
            # Check if column name is directly mentioned
            if col_lower in prompt_lower:
                result["target_column"] = col
                break
                
        # If no direct match, try fuzzy matching
        if not result["target_column"]:
            # Extract potential column references from the prompt
            words = prompt_lower.split()
            for word in words:
                if len(word) > 3:  # Only consider words of reasonable length
                    matches = process.extractOne(word, df_columns, scorer=fuzz.ratio)
                    if matches and matches[1] > 80:
                        result["target_column"] = df.columns[df_columns.index(matches[0])]
                        break
        
        # Extract time references
        time_patterns = {
            "month": r'(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)',
            "year": r'(?:20\d{2}|\d{4})',
            "quarter": r'(?:q[1-4]|quarter [1-4]|first quarter|second quarter|third quarter|fourth quarter)',
            "period": r'(?:last|this|previous|next) (?:month|year|week|quarter)'
        }
        
        time_matches = []
        for time_type, pattern in time_patterns.items():
            matches = re.findall(pattern, prompt_lower)
            if matches:
                time_matches.extend(matches)
                
        if time_matches:
            result["time_range"] = time_matches
            
        return result
        
    except Exception as e:
        logger.error(f"Error classifying query: {str(e)}", exc_info=True)
        return {"query_type": "unknown", "error": str(e)}

@lru_cache(maxsize=100)
def compute_similarity(text1: str, text2: str) -> float:
    """
    Compute semantic similarity between two texts
    Uses sentence embeddings if available, otherwise falls back to fuzzy matching
    """
    try:
        # If embedding model is available, use it for semantic similarity
        if embedding_model is not None and SENTENCE_TRANSFORMERS_AVAILABLE:
            try:
                # Get embeddings
                emb1 = embedding_model.encode([text1])[0]
                emb2 = embedding_model.encode([text2])[0]
                
                # Calculate cosine similarity
                similarity = np.dot(emb1, emb2) / (np.linalg.norm(emb1) * np.linalg.norm(emb2))
                return float(similarity)
            except Exception as e:
                logger.warning(f"Error using embedding model: {str(e)}, falling back to fuzzy matching")
                # Fall through to fuzzy matching
        
        # Enhanced fuzzy matching as fallback
        # We'll use a combination of different matching methods for more robust comparison
        ratio = fuzz.ratio(text1, text2) / 100.0
        partial_ratio = fuzz.partial_ratio(text1, text2) / 100.0
        token_sort_ratio = fuzz.token_sort_ratio(text1, text2) / 100.0
        
        # Weight the different methods
        weighted_similarity = (ratio * 0.4) + (partial_ratio * 0.4) + (token_sort_ratio * 0.2)
        return min(1.0, weighted_similarity)  # Cap at 1.0
        
    except Exception as e:
        logger.error(f"Error computing similarity: {str(e)}")
        # Basic fallback in case of any errors
        try:
            return fuzz.ratio(text1, text2) / 100.0
        except:
            return 0.0  # Last resort fallback

def is_csv_related(prompt: str) -> bool:
    """
    Determine if a user prompt is related to CSV analysis or data processing
    """
    csv_terms = [
        "csv", "data", "file", "spreadsheet", "excel", "column", "row", 
        "table", "dataset", "analyze", "sales", "product", "month", 
        "city", "amount", "quantity", "tax", "highest", "top", "compare",
        "total", "sum", "average", "mean", "median", "trend", "statistics"
    ]
    
    prompt_lower = prompt.lower()
    
    # Direct term matching
    for term in csv_terms:
        if term in prompt_lower:
            return True
    
    # Semantic similarity check
    ref_sentences = [
        "This chatbot analyzes CSV data and answers questions about spreadsheets.",
        "I need help analyzing my sales data from this CSV file.",
        "Can you show me statistics from this dataset?"
    ]
    
    for ref in ref_sentences:
        similarity = compute_similarity(prompt_lower, ref)
        if similarity > 0.6:
            return True
            
    return False

def generate_ai_response(prompt: str, df: Optional[pd.DataFrame] = None, 
                        analysis_result: Optional[Dict] = None, 
                        chat_history: Optional[List] = None) -> str:
    """
    Generate an AI response using the Mistral API based on the prompt and analysis
    """
    try:
        # Sanitize any analysis results to ensure they're JSON-compliant
        if analysis_result and "specific_analysis" in analysis_result:
            # Process each analysis item to ensure it's JSON compatible
            for key, value in analysis_result["specific_analysis"].items():
                if isinstance(value, dict):
                    for field, field_value in list(value.items()):
                        # Check for non-finite values (NaN, Infinity)
                        if isinstance(field_value, float) and (pd.isna(field_value) or np.isinf(field_value)):
                            # Replace with None (will become null in JSON)
                            analysis_result["specific_analysis"][key][field] = None
                        # Handle nested dictionaries
                        elif isinstance(field_value, dict):
                            for nested_key, nested_value in list(field_value.items()):
                                if isinstance(nested_value, float) and (pd.isna(nested_value) or np.isinf(nested_value)):
                                    analysis_result["specific_analysis"][key][field][nested_key] = None
        
        # Prepare system prompt based on available data
        system_prompt = "You are a helpful CSV data analysis assistant. "
        
        if df is not None:
            system_prompt += f"You're analyzing a CSV file with {len(df)} rows and {len(df.columns)} columns. "
            system_prompt += f"The columns are: {', '.join(df.columns.tolist())}. "
            
            # Check for special query types
            query_type = None
            if analysis_result and "query_classification" in analysis_result:
                query_type = analysis_result["query_classification"].get("query_type")
            
            # For tax calculation queries, provide more specific instructions
            if query_type == "tax_calculation":
                # Check if this is an entity-specific tax query
                has_entity_query = False
                entity_name = None
                
                if analysis_result and "specific_analysis" in analysis_result:
                    if "entity_query" in analysis_result["specific_analysis"]:
                        has_entity_query = True
                        entity_name = analysis_result["specific_analysis"]["entity_query"].get("entity")
                
                if has_entity_query and entity_name:
                    system_prompt += f"""
For this entity-specific tax query about "{entity_name}", do the following:
1. If the analysis contains entity-specific tax or taxable amount calculations in specific_analysis, provide the exact numbers from that analysis.
2. Be sure to clearly mention that the amounts are specifically for {entity_name}.
3. Format any currency values using Indian Rupees symbol (₹) such as ₹1,234.56.
4. If entity_tax_total is available in the data, use those values as they are the most accurate for this specific entity.
5. Always use the Indian Rupee symbol (₹) as this data is from Indian tax documents.
6. Focus on the entity-specific data rather than the overall totals.
"""
                else:
                    system_prompt += """
For tax-related queries, do the following:
1. If the analysis contains tax or taxable amount calculations in specific_analysis, provide the exact numbers from that analysis.
2. Explain the calculation clearly and concisely.
3. Format any currency values using Indian Rupees symbol (₹) such as ₹1,234.56.
4. If multiple tax-related columns were found, explain each one briefly.
5. Do not suggest using formulas or external tools like Excel. Instead, provide the direct numerical answer.
6. Always use the Indian Rupee symbol (₹) as this data is from Indian tax documents.
"""
            
            # Add basic stats if available
            if analysis_result and "numeric_stats" in analysis_result:
                system_prompt += "Here are some key statistics:\n"
                for col, stats in analysis_result["numeric_stats"].items():
                    system_prompt += f"- {col}: min={stats['min']:.2f}, max={stats['max']:.2f}, mean={stats['mean']:.2f}\n"
        else:
            system_prompt += "You help users understand and analyze CSV data. "
            system_prompt += "If the user hasn't uploaded a CSV file yet, encourage them to do so."
            
        # Add query classification if available
        if analysis_result and "query_classification" in analysis_result:
            query_type = analysis_result["query_classification"].get("query_type")
            if query_type and query_type != "unknown":
                system_prompt += f"\nThe user seems to be asking about {query_type}. "
                
        # Add specific analysis results if available
        if analysis_result and "specific_analysis" in analysis_result:
            system_prompt += "\nHere are the results of specific analyses:\n"
            for analysis_name, results in analysis_result["specific_analysis"].items():
                system_prompt += f"- {analysis_name}: {json.dumps(results)}\n"
                
        # Prepare message history
        messages = [{"role": "system", "content": system_prompt}]
        
        # Add chat history if available
        if chat_history and len(chat_history) > 0:
            for msg in chat_history[-5:]:  # Last 5 messages only
                role = msg.get("role", "").lower()
                if role in ["user", "assistant"]:
                    messages.append({
                        "role": role,
                        "content": msg.get("content", "")
                    })
                    
        # Add current prompt
        messages.append({"role": "user", "content": prompt})
        
        # Make API request to Mistral AI
        api_url = getattr(settings, "MISTRAL_API_URL", "https://api.mistral.ai/v1/chat/completions")
        api_key = getattr(settings, "MISTRAL_API_KEY", os.getenv("MISTRAL_API_KEY"))
        
        if not api_key:
            logger.error("Mistral API key not found")
            return "Error: API key not configured. Please contact the administrator."
            
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "model": "mistral-tiny",  # Using smaller model for faster responses
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 800
        }
        
        logger.info(f"Sending request to Mistral API with {len(messages)} messages")
        response = requests.post(api_url, headers=headers, json=payload)
        
        if response.status_code != 200:
            logger.error(f"Mistral API error: {response.status_code} - {response.text}")
            
            # Fallback response if API fails
            if df is not None:
                return f"I've analyzed your CSV file with {len(df)} rows and {len(df.columns)} columns. " + \
                       f"The columns are: {', '.join(df.columns.tolist())}. " + \
                       "However, I encountered an error generating a detailed response. " + \
                       "Please try again with a more specific question about your data."
            else:
                return "I'm sorry, but I encountered an error processing your request. " + \
                       "Please upload a CSV file so I can analyze it and answer your questions."
                       
        # Extract and return the response
        response_data = response.json()
        ai_response = response_data.get("choices", [{}])[0].get("message", {}).get("content", "")
        
        if not ai_response:
            logger.error("Empty response from Mistral API")
            return "I'm sorry, but I couldn't generate a response. Please try again with a different question."
            
        logger.info(f"Generated AI response of length {len(ai_response)}")
        return ai_response
        
    except Exception as e:
        logger.error(f"Error generating AI response: {str(e)}", exc_info=True)
        
        # Provide a helpful fallback response
        if df is not None:
            return f"I've analyzed your CSV file with {len(df)} rows and {len(df.columns)} columns, " + \
                   "but encountered an error generating a detailed response. Please try again with a more specific question."
        else:
            return "I'm sorry, but I encountered an error processing your request. " + \
                   "Please try again or upload a CSV file for me to analyze."
                   
def extract_entity_references(prompt: str, df: pd.DataFrame) -> Dict[str, Any]:
    """Extract entity references from the prompt such as specific names, values, etc."""
    entity_references = {
        "column_values": {},
        "filters": {},
        "tax_query": False,  # Initialize the tax_query flag
        "specific_entities": []  # Track specific entities mentioned in the query
    }
    
    try:
        prompt_lower = prompt.lower()
        
        # Check for common tax-related terms
        tax_terms = ["tax", "taxable", "gst", "vat", "cgst", "sgst", "igst"]
        amount_terms = ["amount", "amt", "total", "sum", "value"]
        
        # Check if this is a tax query
        if any(tax_term in prompt_lower for tax_term in tax_terms) and any(amount_term in prompt_lower for amount_term in amount_terms):
            entity_references["tax_query"] = True
            # Try to identify which specific tax column is being asked about
            for col in df.columns:
                col_lower = col.lower()
                for tax_term in tax_terms:
                    if tax_term in col_lower and any(amt_term in col_lower for amt_term in amount_terms):
                        entity_references["tax_column"] = col
                        break
        
        # Special entity detection - look for specific entity patterns first
        special_entities = {
            "nikhil ceramics": ["nikhil", "ceramic"],
        }
        
        for entity_name, keywords in special_entities.items():
            if all(keyword in prompt_lower for keyword in keywords):
                entity_references["specific_entities"].append(entity_name)
        
        # Check each column for potential entity mentions in the prompt
        for column in df.columns:
            if pd.api.types.is_object_dtype(df[column]):  # Check categorical/text columns
                unique_values = df[column].dropna().unique()
                
                # First check for special entities that we already identified
                if entity_references["specific_entities"]:
                    for entity in entity_references["specific_entities"]:
                        for value in unique_values:
                            if isinstance(value, str):
                                value_lower = value.lower()
                                
                                # Check if this value matches our special entity
                                # For "nikhil ceramics", match any value containing both "nikhil" and "ceramic"
                                if all(keyword in value_lower for keyword in special_entities.get(entity, [])):
                                    if column not in entity_references["column_values"]:
                                        entity_references["column_values"][column] = []
                                    entity_references["column_values"][column].append(value)
                                    entity_references["filters"][column] = value
                
                # Then check for exact matches in the prompt for other entities
                for value in unique_values:
                    if isinstance(value, str) and len(value) > 3:  # Only check substantial values
                        value_lower = value.lower()
                        
                        # Try exact matching
                        if value_lower in prompt_lower:
                            if column not in entity_references["column_values"]:
                                entity_references["column_values"][column] = []
                            entity_references["column_values"][column].append(value)
                            entity_references["filters"][column] = value
        
        # Prioritize Party Name or customer-related columns for filtering
        if len(entity_references["filters"]) > 1:
            priority_columns = ["Party Name", "Customer", "Client", "Account", "Name"]
            for priority_col in priority_columns:
                for col in list(entity_references["filters"].keys()):
                    if priority_col.lower() in col.lower():
                        # Keep this as the primary filter
                        primary_filter = {col: entity_references["filters"][col]}
                        entity_references["primary_filter"] = primary_filter
                        break
                if "primary_filter" in entity_references:
                    break
        
        # When we have a tax query and a specific entity, make sure to capture both
        if entity_references["tax_query"] and entity_references["specific_entities"]:
            # If we have an entity like "nikhil ceramics" and this is a tax query,
            # look specifically for the "Party Name" column or similar
            party_name_cols = [col for col in df.columns if "party" in col.lower() or "name" in col.lower()]
            if party_name_cols:
                for party_col in party_name_cols:
                    for entity in entity_references["specific_entities"]:
                        # Try to find full or partial matches
                        keywords = special_entities.get(entity, [])
                        if keywords:
                            # Check for matches containing all keywords
                            matches = df[df[party_col].astype(str).str.lower().str.contains('|'.join(keywords), regex=True)]
                            if not matches.empty:
                                entity_references["filters"][party_col] = matches[party_col].iloc[0]
                                # Store the filtered data for further processing
                                entity_references["filtered_data"] = matches
                                # Identify all relevant amount columns (taxable, item amount, bill amount, etc.)
                                amount_cols = []
                                # Look for tax amount columns
                                tax_cols = [col for col in df.columns if "tax" in col.lower() and "amt" in col.lower()]
                                if tax_cols:
                                    amount_cols.extend(tax_cols)
                                    entity_references["tax_column"] = tax_cols[0]
                                
                                # Look for item amount columns
                                item_cols = [col for col in df.columns if "item" in col.lower() and "amount" in col.lower()]
                                if item_cols:
                                    amount_cols.extend(item_cols)
                                    entity_references["item_column"] = item_cols[0]
                                
                                # Look for bill amount columns
                                bill_cols = [col for col in df.columns if "bill" in col.lower() and "amount" in col.lower()]
                                if bill_cols:
                                    amount_cols.extend(bill_cols)
                                    entity_references["bill_column"] = bill_cols[0]
                                
                                # Process each amount column
                                for amount_col in amount_cols:
                                    # Calculate entity-specific amount
                                    current_col = amount_col
                                    # Get a clean column name key for the dictionary
                                    col_key = current_col.lower().replace(' ', '_').replace('.', '')
                                    
                                    # If the column is not numeric, convert it
                                    if not pd.api.types.is_numeric_dtype(matches[current_col]):
                                        try:
                                            # Convert to numeric, handling currency symbols and commas
                                            numeric_vals = matches[current_col].astype(str).replace('[\$,₹,£,€]', '', regex=True)
                                            numeric_vals = numeric_vals.replace(',', '', regex=True)
                                            numeric_vals = pd.to_numeric(numeric_vals, errors='coerce')
                                            
                                            # Calculate entity-specific amount
                                            entity_amount_sum = numeric_vals.fillna(0).sum()
                                            # Ensure the value is finite
                                            if pd.isna(entity_amount_sum) or np.isinf(entity_amount_sum):
                                                total_value = 0.0
                                            else:
                                                total_value = float(entity_amount_sum)
                                                
                                            # Store each column's total in a specifically named key
                                            entity_references[f"entity_{col_key}_total"] = {
                                                "entity": entity,
                                                "column": current_col,
                                                "total": total_value,
                                                "row_count": len(matches),
                                                "currency": "₹"  # Explicitly set currency as Indian Rupees
                                            }
                                            
                                            # Legacy support for entity_tax_total if this is a tax column
                                            if "tax" in col_key and "amt" in col_key:
                                                entity_references["entity_tax_total"] = entity_references[f"entity_{col_key}_total"]
                                                
                                        except Exception as e:
                                            logger.warning(f"Error calculating entity amount sum for {current_col}: {str(e)}")
                                    else:
                                        # Already numeric, just sum
                                        entity_amount_sum = matches[current_col].fillna(0).sum()
                                        # Ensure the value is finite
                                        if pd.isna(entity_amount_sum) or np.isinf(entity_amount_sum):
                                            total_value = 0.0
                                        else:
                                            total_value = float(entity_amount_sum)
                                            
                                        # Store each column's total in a specifically named key
                                        entity_references[f"entity_{col_key}_total"] = {
                                            "entity": entity,
                                            "column": current_col,
                                            "total": total_value,
                                            "row_count": len(matches),
                                            "currency": "₹"  # Explicitly set currency as Indian Rupees
                                        }
                                        
                                        # Legacy support for entity_tax_total if this is a tax column
                                        if "tax" in col_key and "amt" in col_key:
                                            entity_references["entity_tax_total"] = entity_references[f"entity_{col_key}_total"]
                                break
    
    except Exception as e:
        logger.error(f"Error extracting entity references: {str(e)}", exc_info=True)
    
    return entity_references
