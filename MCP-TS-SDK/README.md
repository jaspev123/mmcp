# MCP-enabled DuckDB Query Demo Application

This project demonstrates different approaches to implementing the Model Context Protocol (MCP) with DuckDB database queries using AI agents. It includes three demo applications that showcase varying levels of MCP adoption and integration patterns.

This demostration project code was for the most part created by AI tools(https://claude.ai/chat generated agen11 code  initially). The generated code was lacking 
the LLM loop that is essential for intended functionality. The code was then modified by hand to add the LLM loop (agent22.ts & agent33.ts).
This readme.md was first created by Warp shell and then modified by hand.

## Prerequisites

- Node.js (version v20.19.2 was used)
- npm 
- TypeScript
- AWS Bedrock access (for Bedrock LLM integration)
- Ollama (for local LLM integration)
- Docker Desktop (for Ollama server)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Initialize the DuckDB Database

Before running any demo applications, you need to initialize the DuckDB database with sample data:

```bash
npm run importdb
```

This script (`import-database-parquet.ts`) performs the following operations:
- Creates a `database` directory if it doesn't exist
- Initializes a new DuckDB database file at `./database/data.duckdb`
- Imports the NYC taxi trip data from `yellow_tripdata_2022-01.parquet` into a table named `tripdata`
- The parquet file contains NYC Yellow Taxi trip records from January 2022

### 3. Initialize the Ollama Server

Before running any demo applications, you need to initialize the Ollama server with sample data:

```bash
  docker pull ollama/ollama:0.10.0-rc0
  docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
  docker exec -it ollama ollama pull llama3.2
```

### 4. Run Demo Applications

Each demo can be run with different LLM backends:

#### Agent 11 (Basic MCP Integration)
```bash
# Using AWS Bedrock (default)
npm run agent11

# Using Ollama
npm run agent11:ollama

# View available MCP resources, tools, and prompts
npm run agent11:mcp
```

#### Agent 22 (Intermediate MCP Integration)
```bash
# Using AWS Bedrock (default)
npm run agent22

# Using Ollama
npm run agent22:ollama

# View available MCP resources, tools, and prompts
npm run agent22:mcp
```

#### Agent 33 (Advanced MCP Integration)
```bash
# Using Ollama (primary)
npm run agent33

# View available MCP resources, tools, and prompts
npm run agent33:mcp
```

## Demo Applications Overview

The three demo applications demonstrate different levels of MCP (Model Context Protocol) adoption and implementation patterns:
The apps are consiole applications and what they do can be observed in the console output. All apps send the same  end user prompt that is then 
embedded into a larger prompt (by MCP server) and sent to the LLM. The LLM then generates a response that is sent back to the app.

The goal is that a LLM generates a SQL query that can be executed against the DuckDB database. Finally the query results should be displeyed in the console.

### Agent 11 - Basic MCP Integration
**File**: `runAgent11.ts` / `duckdb-agent11.ts`

- **MCP Level**: Basic/Traditional
- **Approach**: Direct MCP resource and prompt consumption
- **Characteristics**:
  - Uses MCP server to fetch database schema via resources
  - Retrieves pre-defined prompts from MCP server
  - Executes SQL queries through MCP tools (not invoked by LLM)
  - Simple request-response pattern
  - Minimal AI agent autonomy

### Agent 22 - Intermediate MCP Integration
**File**: `runAgent22.ts` / `duckdb-agent22.ts`

- **MCP Level**: Intermediate/Guided
- **Approach**: JSON-guided interaction loop
- **Characteristics**:
  - Uses structured JSON responses to guide agent behavior
  - Implements a conversation loop between LLM and MCP server
  - LLM can request specific resources, prompts, and tools based on context
  - More dynamic interaction pattern
  - Agent makes decisions about what MCP capabilities to use
  - **Note**: This approach tightly couples the prompt with agent implementation, which is not ideal MCP usage

### Agent 33 - Advanced MCP Integration
**File**: `runAgent33.ts` / `duckdb-agent33.ts`

- **MCP Level**: Advanced/Native Tool Integration
- **Approach**: Native LLM tool calling with MCP tools
- **Characteristics**:
  - Leverages native LLM tool calling capabilities (via Ollama)
  - Automatically converts MCP tools to LLM-compatible tool definitions
  - Implements proper conversational context management
  - LLM autonomously decides when and how to use available tools
  - Most natural and flexible MCP integration
  - Supports iterative problem-solving with tool feedback loops

## Database Schema

The imported NYC taxi data (`tripdata` table) contains the following key columns:
- `tpep_pickup_datetime` - Trip start timestamp
- `tpep_dropoff_datetime` - Trip end timestamp
- `trip_distance` - Distance traveled in miles
- `fare_amount` - Base fare amount
- `total_amount` - Total charge to passengers
- `PULocationID` / `DOLocationID` - Pickup/dropoff location IDs
- And various other trip-related fields

## MCP Server Components

Each demo application connects to its corresponding MCP server:
- `duckdb-server11` - Basic MCP server with resources and tools
- `duckdb-server22` - Enhanced server supporting dynamic resource discovery
- `duckdb-server33` - Advanced server with comprehensive tool definitions

## Environment Configuration

### AWS Bedrock Setup
Ensure you have AWS credentials configured and access to the Bedrock service in the `eu-north-1` region.

### Ollama Setup
Install and run Ollama with the `llama3.2` model:
```bash
  docker pull ollama/ollama:0.10.0-rc0
  docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
  docker exec -it ollama ollama pull llama3.2
```

## Available Scripts

- `npm run importdb` - Initialize DuckDB database with parquet data
- `npm run agent11` - Run Agent 11 with Bedrock LLM
- `npm run agent11:ollama` - Run Agent 11 with Ollama LLM
- `npm run agent11:mcp` - Show MCP capabilities for Agent 11
- `npm run agent22` - Run Agent 22 with Bedrock LLM
- `npm run agent22:ollama` - Run Agent 22 with Ollama LLM
- `npm run agent22:mcp` - Show MCP capabilities for Agent 22
- `npm run agent33` - Run Agent 33 with Ollama LLM
- `npm run agent33:mcp` - Show MCP capabilities for Agent 33


## Architecture

The project demonstrates a progression from basic MCP usage to advanced AI agent integration:

1. **Level 1**: Traditional client-server MCP interaction
2. **Level 2**: Guided agent with JSON-structured decision making
3. **Level 3**: Native tool-calling integration with autonomous agent behavior

Each level showcases different aspects of MCP capabilities and integration patterns, from simple resource consumption to sophisticated AI-driven tool orchestration.

## Sample Query

All demo applications execute variations of this sample query:
> "List taxi trips that have the largest trip distance for each month (also show the year in separate column). Format dates like 'mm.dd.yyyy'. Give months a human readable name."

The different agents handle this query using their respective MCP integration approaches, demonstrating how the same business logic can be implemented with varying levels of MCP sophistication.
