
def get_analyzed_data(file):
    """Helper function to get analyzed data from file"""
    df = extract_text_from_csv(file)
    validation_results = validate_csv_data(df)
    
    if validation_results.get("errors"):
        return None, validation_results["errors"][0]
        
    return df, None

import os
import pandas as pd
import numpy as np
import logging
import json
from django.http import JsonResponse
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import ChatHistory, UploadedFile
from .nlp_utils import (
    extract_text_from_csv,
    analyze_csv_data,
    is_csv_related,
    validate_csv_data,
    classify_query,
    generate_ai_response
)

def sanitize_json_data(data):
    """Recursively sanitize any non-JSON compliant values in a dictionary or list"""
    if isinstance(data, dict):
        return {key: sanitize_json_data(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [sanitize_json_data(item) for item in data]
    elif isinstance(data, (float, np.float64, np.float32)):
        # Convert NaN and Infinity to None (null in JSON)
        if pd.isna(data) or np.isinf(data):
            return None
        return float(data)  # Convert numpy float types to Python float
    elif isinstance(data, (int, np.int64, np.int32)):
        return int(data)  # Convert numpy int types to Python int
    elif isinstance(data, (str, bool, type(None))):
        return data
    else:
        # Convert other types to string to ensure JSON compatibility
        return str(data)

logger = logging.getLogger(__name__)

@api_view(['POST'])
def process_file_and_prompt(request):
    """
    Process an uploaded CSV file and user prompt, returning analysis results
    """
    try:
        logger.info("Received request at process_file_and_prompt")
        
        # Get prompt from request
        prompt = request.POST.get('prompt', '') or request.data.get('message', '')
        
        # Check if there's a file in the request
        file = request.FILES.get('file', None)
        
        # If no file is uploaded, try to get the latest file from database
        if not file:
            latest_file = UploadedFile.objects.order_by('-uploaded_at').first()
            if latest_file:
                file = latest_file.file
            else:
                return Response({
                    "error": "Please upload a CSV file first"
                }, status=400)
        
        logger.info(f"User Prompt: '{prompt}'")
        
        # Handle case with no file but message/prompt
        if not file:
            chat_history = request.data.get('chat_history', [])
            return handle_text_only_request(prompt, chat_history)
            
        # Validate file size and format
        if file.size > settings.DATA_UPLOAD_MAX_MEMORY_SIZE:
            logger.warning(f"File too large: {file.size} bytes")
            return Response({
                "error": f"File size exceeds maximum limit of {settings.DATA_UPLOAD_MAX_MEMORY_SIZE // (1024 * 1024)}MB."
            }, status=400)
            
        file_ext = file.name.split('.')[-1].lower()
        if file_ext not in settings.ALLOWED_FILE_TYPES:
            logger.warning(f"Invalid file type: {file_ext}")
            return Response({
                "error": f"Unsupported file type. Allowed types: {', '.join(settings.ALLOWED_FILE_TYPES)}"
            }, status=400)
        
        # Save uploaded file
        uploaded_file = UploadedFile(file=file)
        uploaded_file.save()
        
        # Process CSV file
        try:
            df = extract_text_from_csv(file)
            
            # Validate CSV data
            validation_results = validate_csv_data(df)
            if validation_results.get("errors"):
                return Response({
                    "error": validation_results["errors"][0]
                }, status=400)
            
            # Analyze data based on prompt
            analysis_result = analyze_csv_data(df, prompt)
            
            # Generate response
            response_text = generate_ai_response(prompt, df, analysis_result)
            
            # Save to chat history
            ChatHistory.objects.create(
                user_input=prompt,
                bot_response=response_text,
                context=json.dumps({
                    "file_name": file.name,
                    "file_size": file.size,
                    "row_count": len(df),
                    "column_count": len(df.columns)
                })
            )
            
            # Prepare response with detailed analysis
            response_data = {
                "success": True,
                "response": response_text,
                "analysis": {
                    "rows": len(df),
                    "columns": len(df.columns),
                    "column_types": analysis_result.get("column_types", {}),
                    "query_classification": analysis_result.get("query_classification", {}),
                }
            }
            
            if validation_results.get("warnings"):
                response_data["warnings"] = validation_results["warnings"]
                
            logger.info("Successfully processed file and prompt")
            # Sanitize response data to ensure JSON compatibility
            sanitized_data = sanitize_json_data(response_data)
            return Response(sanitized_data, status=200)
            
        except Exception as e:
            logger.error(f"Error processing CSV file: {str(e)}", exc_info=True)
            return Response({
                "error": f"Error processing CSV file: {str(e)}"
            }, status=400)
            
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return Response({
            "error": f"An unexpected error occurred: {str(e)}"
        }, status=500)

def handle_text_only_request(prompt, chat_history):
    """
    Handle requests without a file upload, using just the text prompt
    """
    try:
        logger.info(f"Processing text-only prompt: '{prompt}'")
        
        if not prompt:
            return Response({
                "error": "Please provide a message or question."
            }, status=400)
        
        # Check if the prompt is CSV-related
        if not is_csv_related(prompt):
            return Response({
                "success": True,
                "response": "I'm designed to analyze CSV data. Please upload a CSV file or ask me a question about data analysis. Here are some examples of what I can help with:\n\n" +
                           "- Calculate total sales by region\n" +
                           "- Find the highest value in a specific column\n" +
                           "- Compare values between different time periods\n" +
                           "- Identify trends in numerical data\n" +
                           "- Summarize statistics from your dataset"
            }, status=200)
        
        # Generate a response based on the prompt without file context
        ai_response = generate_ai_response(prompt, None, None, chat_history)
        
        # Save to chat history
        ChatHistory.objects.create(
            user_input=prompt,
            bot_response=ai_response
        )
        
        response_data = {
            "success": True,
            "response": ai_response
        }
        # Sanitize response data to ensure JSON compatibility
        sanitized_data = sanitize_json_data(response_data)
        return Response(sanitized_data, status=200)
        
    except Exception as e:
        logger.error(f"Error processing text-only prompt: {str(e)}", exc_info=True)
        return Response({
            "error": f"Error processing your request: {str(e)}"
        }, status=500)

@api_view(['GET'])
def chat_history(request):
    """Return the recent chat history"""
    try:
        history = ChatHistory.objects.all().order_by('-timestamp')[:50].values()
        history_data = {"chat_history": list(history)}
        # Sanitize response data to ensure JSON compatibility
        sanitized_data = sanitize_json_data(history_data)
        return Response(sanitized_data, status=200)
    except Exception as e:
        logger.error(f"Error fetching chat history: {str(e)}", exc_info=True)
        return Response({"error": f"Error fetching chat history: {str(e)}"}, status=500)
