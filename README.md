# Roggler

A comprehensive tool for analyzing Path of Exile build data from POE.ninja with advanced attribute grouping and aggregation capabilities.

## Features

- **Advanced Item Analysis**: Analyze rare items with complete modifier and skill breakdowns
- **Attribute Grouping**: Group items by attributes (Dex, Str, Int, DexInt, StrDex, StrInt) for better organization
- **Multi-API Aggregation**: Click on grouped items to aggregate data across multiple basetypes with weighted averages
- **Real-time Data**: Fetches live data from POE.ninja with protobuf decoding
- **Error Handling**: Robust error handling with blacklist system for problematic API calls

## Quick Start

1. **Start the server:**
   ```bash
   node server.js
   ```

2. **Open the application:**
   - Main Analysis Tool: `http://localhost:8000/maintest.html`
   - Test Tool: `http://localhost:8000/turquoise-test.html`

## Files

- `maintest.html` - Main analysis tool with attribute grouping and aggregation
- `turquoise-test.html` - Simple test tool for individual API calls
- `server.js` - CORS proxy server for POE.ninja API
- `protobuf-decoder.js` - Protobuf decoding library
- `basetypes_5.json` - Item attribute mapping data

## Usage

1. Enter a POE.ninja snapshot ID (format: `XXXX-YYYYMMDD-XXXXX`)
2. Select a rare item type (e.g., "Rare Body Armour")
3. Analyze individual dimensions or click on grouped attributes
4. View aggregated modifier and skill data in the side panel

## Technical Details

- Uses POE.ninja's protobuf API for efficient data transfer
- Implements weighted averages for multi-basetype aggregation
- Sequential API calls to avoid browser connection limits
- Blacklist system for problematic basetypes that cause hanging