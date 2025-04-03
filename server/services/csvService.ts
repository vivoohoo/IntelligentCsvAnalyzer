import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import fetch from 'node-fetch';

const DJANGO_API_URL = 'http://localhost:8000';

// Check if the Python backend is available
export function checkNLPAvailability(): boolean {
  try {
    // Since we're developing without Django for now, return false
    // to use the fallback CSV processing implementation
    return false;
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
    // Always use our fallback processing for now since we're developing
    // the prototype without the Django backend
    return fallbackCSVProcessing(csvData, prompt, chatHistory);
  } catch (error) {
    console.error('Error processing CSV:', error);
    return `I'm having trouble processing your request. ${error instanceof Error ? error.message : 'Please try again later.'}`;
  }
}

// CSV processing function for analyzing data
async function fallbackCSVProcessing(
  csvData: Buffer | null, 
  prompt: string,
  chatHistory: Array<{role: string, content: string}> = []
): Promise<string> {
  // If no file is provided, return general information
  if (!csvData) {
    if (prompt.toLowerCase().includes('invoice') || 
        prompt.toLowerCase().includes('bill') || 
        prompt.toLowerCase().includes('transaction') ||
        prompt.toLowerCase().includes('GST') ||
        prompt.toLowerCase().includes('tax')) {
      return "I need a CSV file to analyze invoices or transactions. Please upload a file with your financial data first.";
    }
    
    return "I'm designed to analyze CSV data. Please upload a CSV file to continue.";
  }
  
  try {
    // Parse CSV data
    const csvContent = csvData.toString('utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    // Convert CSV rows to objects for easier analysis
    const data = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values = lines[i].split(',').map(v => v.trim());
      const row: Record<string, string> = {};
      
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      
      data.push(row);
    }
    
    // Count the number of rows
    const rowCount = data.length;
    
    // Detect types of columns
    const columnTypes: Record<string, string> = {};
    headers.forEach(header => {
      // Check sample values to determine column type
      const sampleValues = data.slice(0, Math.min(5, data.length)).map(row => row[header]);
      
      // Check if column contains mostly numbers
      const numericCount = sampleValues.filter(v => !isNaN(Number(v)) && v.trim() !== '').length;
      
      if (numericCount >= sampleValues.length / 2) {
        columnTypes[header] = 'numeric';
      } else if (
        header.toLowerCase().includes('date') || 
        sampleValues.some(v => /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(v))
      ) {
        columnTypes[header] = 'date';
      } else {
        columnTypes[header] = 'text';
      }
    });
    
    // Handle different query types
    
    // Count queries (how many, total number of, etc.)
    const isCountQuery = prompt.toLowerCase().match(/how many|count|total number|find the number|number of/);
    
    // Invoice/bill/transaction related queries
    const isInvoiceQuery = prompt.toLowerCase().match(/invoice|bill|receipt|challan|voucher|record|entry/);
    
    // Tax or GST related queries (specific to Indian context)
    const isTaxQuery = prompt.toLowerCase().match(/tax|gst|cgst|sgst|igst|tds|pan|aadhaar/);
    
    // Time-based queries
    const isTimeQuery = prompt.toLowerCase().match(/month|year|quarter|date|period|time/);
    
    // Handle specific query combinations
    if (isCountQuery && isInvoiceQuery) {
      return `I found ${rowCount} records in your CSV file. Each row likely represents a separate invoice or transaction.`;
    }
    
    // Handle basic tax and GST queries (common in Indian financial data)
    if (isTaxQuery) {
      // Look for tax or GST related columns
      const taxColumns = headers.filter(h => 
        h.toLowerCase().includes('tax') || 
        h.toLowerCase().includes('gst') || 
        h.toLowerCase().includes('cgst') || 
        h.toLowerCase().includes('sgst') || 
        h.toLowerCase().includes('igst')
      );
      
      if (taxColumns.length > 0) {
        return `I found the following tax-related columns in your data: ${taxColumns.join(', ')}. What specific tax information would you like to analyze?`;
      } else {
        return `I couldn't find specific tax or GST columns in your data. The available columns are: ${headers.join(', ')}. Could you clarify which columns contain tax information?`;
      }
    }
    
    // Handle time-based queries
    if (isTimeQuery) {
      // Look for date or time related columns
      const dateColumns = headers.filter(h => 
        h.toLowerCase().includes('date') || 
        h.toLowerCase().includes('time') || 
        h.toLowerCase().includes('month') || 
        h.toLowerCase().includes('year') ||
        columnTypes[h] === 'date'
      );
      
      if (dateColumns.length > 0) {
        return `I found date-related columns in your data: ${dateColumns.join(', ')}. What specific time period would you like to analyze?`;
      }
    }
    
    // Default response with file information
    return `I've analyzed your CSV data with ${rowCount} rows and ${headers.length} columns. The columns are: ${headers.join(', ')}. 
You can ask me specific questions about this data, such as counting invoices, analyzing tax information, or finding entries for specific time periods.`;
  } catch (error) {
    console.error('Error in CSV processing:', error);
    return "I had trouble parsing your CSV file. Please make sure it's properly formatted with comma-separated values.";
  }
}
