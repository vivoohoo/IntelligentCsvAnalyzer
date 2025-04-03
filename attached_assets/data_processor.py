import pandas as pd
import numpy as np
import re
import logging
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime, timedelta
import json
from collections import defaultdict
from functools import lru_cache
import hashlib

logger = logging.getLogger(__name__)

class DataProcessor:
    """Class for advanced CSV data processing and analysis"""
    
    def __init__(self):
        self.cache = {}
        self.column_metadata = {}
        
    def process_csv(self, df: pd.DataFrame) -> Dict[str, Any]:
        """
        Process a CSV DataFrame and extract comprehensive metadata
        """
        try:
            # Generate a unique key for this dataframe for caching
            df_hash = self._generate_df_hash(df)
            
            # Check if we've already processed this exact dataframe
            if df_hash in self.cache:
                logger.info(f"Using cached analysis for dataframe {df_hash[:8]}")
                return self.cache[df_hash]
                
            # Initialize result structure
            result = {
                "basic_info": {
                    "row_count": len(df),
                    "column_count": len(df.columns),
                    "memory_usage": df.memory_usage(deep=True).sum() / (1024 * 1024),  # MB
                    "null_cells": df.isnull().sum().sum(),
                    "null_percentage": 100 * df.isnull().sum().sum() / (df.shape[0] * df.shape[1])
                },
                "columns": {},
                "relationships": [],
                "insights": []
            }
            
            # Process each column
            for column in df.columns:
                result["columns"][column] = self._analyze_column(df[column])
                
            # Detect relationships between columns
            result["relationships"] = self._detect_column_relationships(df)
            
            # Generate insights
            result["insights"] = self._generate_insights(df, result["columns"])
            
            # Cache the result
            self.cache[df_hash] = result
            self.column_metadata = result["columns"]
            
            logger.info(f"Completed dataframe analysis: {len(result['insights'])} insights generated")
            return result
            
        except Exception as e:
            logger.error(f"Error in process_csv: {str(e)}", exc_info=True)
            return {
                "error": f"Error processing CSV data: {str(e)}",
                "basic_info": {
                    "row_count": len(df) if df is not None else 0,
                    "column_count": len(df.columns) if df is not None else 0
                }
            }
            
    def _generate_df_hash(self, df: pd.DataFrame) -> str:
        """Generate a hash to uniquely identify a dataframe"""
        # Use shape, column names, and sample of data to generate hash
        hash_components = [
            str(df.shape),
            str(list(df.columns)),
            str(df.head(5).values.tolist()),
            str(df.dtypes)
        ]
        
        hash_string = ''.join(hash_components)
        return hashlib.md5(hash_string.encode()).hexdigest()
        
    def _analyze_column(self, series: pd.Series) -> Dict[str, Any]:
        """Analyze a single column/series from the dataframe"""
        result = {
            "type": str(series.dtype),
            "unique_count": series.nunique(),
            "null_count": series.isnull().sum(),
            "null_percentage": 100 * series.isnull().sum() / len(series)
        }
        
        # Handle different data types
        if pd.api.types.is_numeric_dtype(series):
            result.update(self._analyze_numeric_column(series))
        elif pd.api.types.is_datetime64_dtype(series):
            result.update(self._analyze_datetime_column(series))
        else:
            # Categorical or text data
            result.update(self._analyze_categorical_column(series))
            
        return result
        
    def _analyze_numeric_column(self, series: pd.Series) -> Dict[str, Any]:
        """Analyze a numeric column"""
        numeric_stats = {
            "min": float(series.min()) if not pd.isna(series.min()) else None,
            "max": float(series.max()) if not pd.isna(series.max()) else None,
            "mean": float(series.mean()) if not pd.isna(series.mean()) else None,
            "median": float(series.median()) if not pd.isna(series.median()) else None,
            "std": float(series.std()) if not pd.isna(series.std()) else None,
            "distribution": {
                "q1": float(series.quantile(0.25)) if not pd.isna(series.quantile(0.25)) else None,
                "q3": float(series.quantile(0.75)) if not pd.isna(series.quantile(0.75)) else None
            }
        }
        
        # Detect potential outliers using IQR method
        q1 = series.quantile(0.25)
        q3 = series.quantile(0.75)
        iqr = q3 - q1
        lower_bound = q1 - 1.5 * iqr
        upper_bound = q3 + 1.5 * iqr
        outliers = series[(series < lower_bound) | (series > upper_bound)]
        
        numeric_stats["outliers"] = {
            "count": len(outliers),
            "percentage": 100 * len(outliers) / len(series),
            "bounds": {
                "lower": float(lower_bound) if not pd.isna(lower_bound) else None,
                "upper": float(upper_bound) if not pd.isna(upper_bound) else None
            }
        }
        
        # Determine if likely to be continuous or discrete
        distinct_values = series.nunique()
        numeric_stats["likely_discrete"] = distinct_values <= min(20, len(series) * 0.05)
        
        return {"numeric_stats": numeric_stats}
        
    def _analyze_datetime_column(self, series: pd.Series) -> Dict[str, Any]:
        """Analyze a datetime column"""
        time_stats = {
            "min_date": series.min().strftime("%Y-%m-%d") if not pd.isna(series.min()) else None,
            "max_date": series.max().strftime("%Y-%m-%d") if not pd.isna(series.max()) else None,
            "range_days": (series.max() - series.min()).days if not pd.isna(series.min()) and not pd.isna(series.max()) else None
        }
        
        # Add distribution by year, month, day of week
        if not pd.isna(series.min()):
            try:
                time_stats["distribution"] = {
                    "by_year": series.dt.year.value_counts().sort_index().to_dict(),
                    "by_month": series.dt.month.value_counts().sort_index().to_dict(),
                    "by_weekday": series.dt.dayofweek.value_counts().sort_index().to_dict()
                }
            except:
                pass
                
        return {"time_stats": time_stats}
        
    def _analyze_categorical_column(self, series: pd.Series) -> Dict[str, Any]:
        """Analyze a categorical/text column"""
        # Get value counts for top categories
        value_counts = series.value_counts()
        top_n = 10
        
        cat_stats = {
            "top_values": value_counts.head(top_n).to_dict(),
            "is_unique_identifier": series.nunique() == len(series),
            "avg_length": series.astype(str).str.len().mean() if series.dtype == object else None,
            "max_length": series.astype(str).str.len().max() if series.dtype == object else None
        }
        
        # Check if it might be a categorical column with few distinct values
        if series.nunique() <= min(20, len(series) * 0.1):
            cat_stats["likely_categorical"] = True
        else:
            cat_stats["likely_categorical"] = False
            
        # Try to infer semantic type for text columns
        if series.dtype == object:
            cat_stats["semantic_type"] = self._infer_semantic_type(series)
            
        return {"categorical_stats": cat_stats}
        
    def _infer_semantic_type(self, series: pd.Series) -> str:
        """Try to infer the semantic type of a text column"""
        # Sample non-null values for pattern matching
        sample = series.dropna().astype(str).sample(min(100, len(series.dropna())))
        
        # Define patterns for common data types
        patterns = {
            "email": r'^[\w\.-]+@[\w\.-]+\.\w+$',
            "phone": r'^\+?[\d\s\(\)-]{8,}$',
            "url": r'^https?://\S+$',
            "date_string": r'^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$',
            "numeric_id": r'^\d+$',
            "alphanumeric_id": r'^[A-Za-z0-9-_]+$',
            "address": r'\d+\s+[A-Za-z\s]+\s+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr)',
            "name": r'^[A-Z][a-z]+ [A-Z][a-z]+$'
        }
        
        # Check each pattern against the sample
        matches = {}
        for semantic_type, pattern in patterns.items():
            match_count = sample.str.match(pattern).sum()
            match_percentage = 100 * match_count / len(sample)
            matches[semantic_type] = match_percentage
            
        # Return the semantic type with highest match percentage if above threshold
        best_match = max(matches.items(), key=lambda x: x[1])
        if best_match[1] >= 80:  # At least 80% match
            return best_match[0]
            
        # Fallback
        if series.str.len().mean() <= 2:
            return "code"
        elif series.nunique() <= 10:
            return "category"
        else:
            return "text"
            
    def _detect_column_relationships(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Detect potential relationships between columns"""
        relationships = []
        
        # Only process dataframes with reasonable size
        if len(df.columns) > 50:
            logger.warning(f"Skipping relationship detection for large dataframe with {len(df.columns)} columns")
            return relationships
            
        # Look for potential foreign key relationships
        for col1 in df.columns:
            # Skip columns that are likely not keys
            if df[col1].dtype == object and df[col1].nunique() < 10:
                continue
                
            for col2 in df.columns:
                # Skip same column
                if col1 == col2:
                    continue
                    
                # Check if one column's values are subset of another
                if col1 != col2 and set(df[col1].dropna().unique()).issubset(set(df[col2].dropna().unique())):
                    relationships.append({
                        "type": "potential_foreign_key",
                        "source": col1,
                        "target": col2,
                        "confidence": min(100, 100 * df[col1].nunique() / df[col2].nunique())
                    })
                    
        # Look for high correlations between numeric columns
        numeric_cols = df.select_dtypes(include=['number']).columns
        if len(numeric_cols) > 1:
            try:
                corr_matrix = df[numeric_cols].corr()
                for i, col1 in enumerate(corr_matrix.columns):
                    for j, col2 in enumerate(corr_matrix.columns):
                        if i < j:  # Only check upper triangle
                            corr = corr_matrix.loc[col1, col2]
                            if abs(corr) >= 0.8:  # Strong correlation
                                relationships.append({
                                    "type": "correlation",
                                    "source": col1,
                                    "target": col2,
                                    "value": float(corr),
                                    "direction": "positive" if corr > 0 else "negative"
                                })
            except Exception as e:
                logger.warning(f"Error calculating correlations: {str(e)}")
                
        return relationships
        
    def _generate_insights(self, df: pd.DataFrame, columns: Dict[str, Dict]) -> List[Dict[str, Any]]:
        """Generate data insights based on column analysis"""
        insights = []
        
        # Look for columns with high null percentages
        high_null_cols = []
        for col_name, col_info in columns.items():
            if col_info.get("null_percentage", 0) > 20:
                high_null_cols.append({
                    "name": col_name,
                    "null_percentage": col_info["null_percentage"]
                })
                
        if high_null_cols:
            insights.append({
                "type": "data_quality",
                "category": "missing_values",
                "title": "Columns with significant missing values",
                "description": f"Found {len(high_null_cols)} columns with more than 20% missing values",
                "affected_columns": [col["name"] for col in high_null_cols],
                "details": high_null_cols
            })
            
        # Look for numeric columns with outliers
        outlier_cols = []
        for col_name, col_info in columns.items():
            numeric_stats = col_info.get("numeric_stats", {})
            outliers = numeric_stats.get("outliers", {})
            if outliers.get("percentage", 0) > 5:
                outlier_cols.append({
                    "name": col_name,
                    "outlier_percentage": outliers.get("percentage", 0)
                })
                
        if outlier_cols:
            insights.append({
                "type": "data_quality",
                "category": "outliers",
                "title": "Columns with significant outliers",
                "description": f"Found {len(outlier_cols)} numeric columns with more than 5% outliers",
                "affected_columns": [col["name"] for col in outlier_cols],
                "details": outlier_cols
            })
            
        # Look for datetime columns to check for time coverage
        datetime_cols = []
        for col_name, col_info in columns.items():
            time_stats = col_info.get("time_stats", {})
            if time_stats:
                datetime_cols.append({
                    "name": col_name,
                    "min_date": time_stats.get("min_date"),
                    "max_date": time_stats.get("max_date"),
                    "range_days": time_stats.get("range_days")
                })
                
        if datetime_cols:
            insights.append({
                "type": "data_structure",
                "category": "time_coverage",
                "title": "Time coverage analysis",
                "description": f"Dataset contains {len(datetime_cols)} datetime columns with time information",
                "affected_columns": [col["name"] for col in datetime_cols],
                "details": datetime_cols
            })
            
        return insights
    
    @lru_cache(maxsize=100)
    def get_column_by_semantic_category(self, df: pd.DataFrame, category: str) -> List[str]:
        """Find columns that match a semantic category"""
        # Process dataframe if not already done
        if not self.column_metadata:
            self.process_csv(df)
            
        # Define semantic categories and their keywords
        semantic_categories = {
            "amount": ["amount", "total", "sum", "price", "cost", "value", "sales", "revenue"],
            "quantity": ["quantity", "count", "number", "units", "volume", "stock"],
            "date": ["date", "time", "day", "month", "year", "created", "updated"],
            "location": ["city", "country", "state", "region", "address", "location", "area"],
            "product": ["product", "item", "sku", "model", "name", "category"],
            "customer": ["customer", "client", "user", "buyer", "account"],
            "tax": ["tax", "vat", "gst", "duty", "levy"]
        }
        
        if category not in semantic_categories:
            return []
            
        keywords = semantic_categories[category]
        matches = []
        
        # First check for exact keyword matches in column names
        for col in df.columns:
            col_lower = col.lower()
            
            # Direct keyword match
            if any(keyword in col_lower for keyword in keywords):
                matches.append(col)
                continue
                
            # Check based on inferred semantic type
            col_info = self.column_metadata.get(col, {})
            cat_stats = col_info.get("categorical_stats", {})
            
            if cat_stats.get("semantic_type") == category:
                matches.append(col)
                
        return matches
        
    def query_data(self, df: pd.DataFrame, query_info: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a data query based on structured query information
        """
        try:
            query_type = query_info.get("query_type", "unknown")
            target_column = query_info.get("target_column")
            target_entity = query_info.get("target_entity")
            time_range = query_info.get("time_range")
            
            # If no target column specified, try to infer based on query type
            if not target_column:
                if query_type in ["highest_sales", "top_products", "summary_statistics"]:
                    amount_cols = self.get_column_by_semantic_category(df, "amount")
                    if amount_cols:
                        target_column = amount_cols[0]
                elif query_type in ["city_analysis"]:
                    location_cols = self.get_column_by_semantic_category(df, "location")
                    if location_cols:
                        target_column = location_cols[0]
                        
            # Execute query based on type
            result = {"query_type": query_type, "success": False}
            
            if query_type == "highest_sales":
                if target_column and pd.api.types.is_numeric_dtype(df[target_column]):
                    # Filter by time range if specified
                    filtered_df = self._apply_time_filter(df, time_range)
                    
                    max_value = filtered_df[target_column].max()
                    max_row = filtered_df.loc[filtered_df[target_column].idxmax()].to_dict()
                    
                    result.update({
                        "success": True,
                        "result": {
                            "max_value": float(max_value),
                            "details": max_row
                        }
                    })
                    
            elif query_type == "top_products":
                product_cols = self.get_column_by_semantic_category(df, "product")
                amount_cols = self.get_column_by_semantic_category(df, "amount")
                
                if product_cols and amount_cols:
                    product_col = product_cols[0]
                    amount_col = amount_cols[0]
                    
                    # Filter by time range if specified
                    filtered_df = self._apply_time_filter(df, time_range)
                    
                    # Group and aggregate
                    top_n = 5
                    product_totals = filtered_df.groupby(product_col)[amount_col].sum().sort_values(ascending=False)
                    top_products = product_totals.head(top_n)
                    
                    result.update({
                        "success": True,
                        "result": {
                            "product_column": product_col,
                            "metric_column": amount_col,
                            "top_products": top_products.to_dict()
                        }
                    })
                    
            elif query_type == "summary_statistics":
                if target_column and pd.api.types.is_numeric_dtype(df[target_column]):
                    # Filter by time range if specified
                    filtered_df = self._apply_time_filter(df, time_range)
                    
                    # Calculate summary statistics
                    stats = filtered_df[target_column].describe()
                    
                    result.update({
                        "success": True,
                        "result": {
                            "column": target_column,
                            "statistics": {
                                "count": int(stats["count"]),
                                "mean": float(stats["mean"]),
                                "std": float(stats["std"]),
                                "min": float(stats["min"]),
                                "q1": float(stats["25%"]),
                                "median": float(stats["50%"]),
                                "q3": float(stats["75%"]),
                                "max": float(stats["max"])
                            }
                        }
                    })
                    
            return result
            
        except Exception as e:
            logger.error(f"Error in query_data: {str(e)}", exc_info=True)
            return {
                "success": False,
                "error": str(e),
                "query_type": query_info.get("query_type", "unknown")
            }
            
    def _apply_time_filter(self, df: pd.DataFrame, time_range: Optional[List[str]]) -> pd.DataFrame:
        """Apply time filtering based on specified time range"""
        if not time_range:
            return df
            
        # Find date columns
        date_cols = self.get_column_by_semantic_category(df, "date")
        if not date_cols:
            return df
            
        # Use first date column for filtering
        date_col = date_cols[0]
        
        # Ensure column is datetime type
        if not pd.api.types.is_datetime64_dtype(df[date_col]):
            try:
                df[date_col] = pd.to_datetime(df[date_col])
            except:
                return df
                
        # Parse time range and apply filter
        filtered_df = df.copy()
        
        for time_spec in time_range:
            time_spec = time_spec.lower()
            
            if time_spec in ["last month", "previous month"]:
                today = datetime.now()
                start_of_last_month = datetime(today.year, today.month, 1) - timedelta(days=1)
                start_of_last_month = datetime(start_of_last_month.year, start_of_last_month.month, 1)
                end_of_last_month = datetime(today.year, today.month, 1) - timedelta(days=1)
                
                filtered_df = filtered_df[(filtered_df[date_col] >= start_of_last_month) & 
                                        (filtered_df[date_col] <= end_of_last_month)]
                                        
            elif time_spec in ["this month"]:
                today = datetime.now()
                start_of_month = datetime(today.year, today.month, 1)
                
                filtered_df = filtered_df[filtered_df[date_col] >= start_of_month]
                
            elif re.match(r"20\d{2}", time_spec):  # Year like 2023
                year = int(time_spec)
                filtered_df = filtered_df[filtered_df[date_col].dt.year == year]
                
            elif time_spec in ["january", "february", "march", "april", "may", "june", 
                            "july", "august", "september", "october", "november", "december"]:
                month_map = {
                    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
                    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12
                }
                month_num = month_map[time_spec]
                filtered_df = filtered_df[filtered_df[date_col].dt.month == month_num]
                
        return filtered_df
