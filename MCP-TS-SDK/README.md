# MCP-enabled DuckDB Query Demo Application

This project demonstrates different approaches to implementing the Model Context Protocol (MCP) with DuckDB database queries using AI agents. It includes four demo applications that showcase varying levels of MCP adoption and integration patterns, including both stdio and HTTP transport implementations.

This demostration project code was for the most part created by AI tools(https://claude.ai/chat generated agent11 code initially). The generated code was lacking 
the LLM loop that is essential for intended MCP functionality. The code was then modified by hand to add the LLM loop (agent22.ts & agent33.ts).
This readme.md was first created by Warp shell and then modified by hand.
The prompt to generate the initial version of this readme.md was: "generate me a readme.md that describes how run the build script in package.json. Also add short description how the 3 demo apps differ in their level of MCP adoption. Also describe how the duckdb database is initialised."


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

The LLM may generate a SQL query that is too large to execute in reasonable time.
The db lockfile migth get stuck. Then just delete the database directory (rm -rf database) and run the import script again.

The import script :
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

#### Agent 44 (HTTP Transport Integration)
```bash
# Start the HTTP MCP server first (in one terminal)
npm run server44

# Then run the agent (in another terminal)
npm run agent44

# View available MCP resources, tools, and prompts
npm run agent44:mcp
```

## Demo Applications Overview

The four demo applications demonstrate different levels of MCP (Model Context Protocol) adoption and implementation patterns, including different transport mechanisms:
The apps are console applications and what they do can be observed in the console output. All apps send the same end user prompt that is then 
embedded into a larger prompt (by MCP server) and sent to the LLM. The LLM then generates a response that is sent back to the app.

The goal is that a LLM generates a SQL query that can be executed against the DuckDB database. Finally the query results should be displayed in the console.

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
- **Transport**: Stdio (StdioClientTransport/StdioServerTransport)
- **Characteristics**:
  - Leverages native LLM tool calling capabilities (via Ollama)
  - Automatically converts MCP tools to LLM-compatible tool definitions
  - Implements proper conversational context management
  - LLM autonomously decides when and how to use available tools
  - Most natural and flexible MCP integration
  - Supports iterative problem-solving with tool feedback loops

### Agent 44 - HTTP Transport Integration
**File**: `runAgent44.ts` / `duckdb-agent44.ts` / `duckdb-server44.ts` / `webserver44.ts`

First run server with:

```bash
npm run server44
```

Then run agent (in separate terminal window) with:

```bash
npm run agent44
```

- **MCP Level**: Advanced/Native Tool Integration with HTTP Transport
- **Approach**: Same as Agent 33 but with HTTP communication
- **Transport**: HTTP (HTTPClientTransport/HTTPServerTransport)
- **Characteristics**:
  - Same advanced MCP integration as Agent 33
  - Uses HTTP REST API for client-server communication
  - Requires separate server process (duckdb-server44.ts)
  - Server runs on http://localhost:3001
  - Better suited for distributed architectures
  - Enables web-based integrations and remote connections
  - Network-based communication instead of process pipes

## Database Schema

The imported NYC taxi data (`tripdata` table) contains the following key columns:
- `tpep_pickup_datetime` - Trip start timestamp
- `tpep_dropoff_datetime` - Trip end timestamp
- `trip_distance` - Distance traveled in miles
- `fare_amount` - Base fare amount
- `total_amount` - Total charge to passengers
- `PULocationID` / `DOLocationID` - Pickup/dropoff location IDs
- And various other trip-related fields

The sample query (bottom of this page) or some variants of it are defined runAgentX.ts files.
The human defined question is expected to contain  relevant keywords (relative to schema) that are used to generate the SQL query.

## MCP Server Components

Each demo application connects to its corresponding MCP server:
- `duckdb-server11` - Basic MCP server with resources and tools (Stdio transport)
- `duckdb-server22` - Enhanced server supporting dynamic resource discovery (Stdio transport)
- `duckdb-server33` - Advanced server with comprehensive tool definitions (Stdio transport)
- `duckdb-server44` - HTTP-based server with same functionality as server33 (HTTP transport on port 3001)

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

### Database Setup
- `npm run importdb` - Initialize DuckDB database with parquet data

### Stdio Transport Agents (11, 22, 33)
- `npm run agent11` - Run Agent 11 with Bedrock LLM
- `npm run agent11:ollama` - Run Agent 11 with Ollama LLM
- `npm run agent11:mcp` - Show MCP capabilities for Agent 11
- `npm run agent22` - Run Agent 22 with Bedrock LLM
- `npm run agent22:ollama` - Run Agent 22 with Ollama LLM
- `npm run agent22:mcp` - Show MCP capabilities for Agent 22
- `npm run agent33` - Run Agent 33 with Ollama LLM
- `npm run agent33:mcp` - Show MCP capabilities for Agent 33

### HTTP Transport (Agent 44)
- `npm run server44` - Start HTTP MCP server on port 3001
- `npm run agent44` - Run Agent 44 with HTTP transport (Ollama LLM)
- `npm run agent44:mcp` - Show MCP capabilities for Agent 44

### Debug Scripts
All agents also have corresponding debug versions (e.g., `npm run agent44:debug`) for debugging with breakpoints.


## Architecture

The project demonstrates a progression from basic MCP usage to advanced AI agent integration:

1. **Level 1**: Traditional client-server MCP interaction
2. **Level 2**: Guided agent with JSON-structured decision making
3. **Level 3**: Native tool-calling integration with autonomous agent behavior
4. **Level 4**: HTTP transport for distributed architectures

Each level showcases different aspects of MCP capabilities and integration patterns, from simple resource consumption to sophisticated AI-driven tool orchestration.

### Transport Mechanisms Comparison

| Feature | Stdio Transport (Agents 11-33) | HTTP Transport (Agent 44) |
|---------|--------------------------------|---------------------------|
| **Communication** | Process pipes/stdin/stdout | HTTP REST API |
| **Deployment** | Single process | Client-server architecture |
| **Network** | Local only | Network-capable |
| **Scalability** | Limited to local process | Distributed/remote capable |
| **Use Cases** | Local integrations, development | Web apps, microservices, production |
| **Complexity** | Lower | Higher (requires server management) |
| **Debugging** | Simpler (single process) | More complex (multi-process) |

## Sample Query

All demo applications execute variations of this sample query:
> "List taxi trips that have the largest trip distance for each month (also show the year in separate column). Format dates like 'mm.dd.yyyy'. Give months a human readable name."

The different agents handle this query using their respective MCP integration approaches, demonstrating how the same business logic can be implemented with varying levels of MCP sophistication.
