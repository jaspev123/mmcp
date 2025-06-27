import MCPDuckDBAgent from './mcp-duckdb-client';

(async () => {
  const agent = new MCPDuckDBAgent();

  try {
    // Initialize connection to MCP server
    await agent.initialize();

    // Ask natural language questions
    const result = await agent.callBedrock(
      "return records having  monthly  max trip distance . give the months human readable names"
    );

    console.log(result);
  } catch (err) {
    console.error("Error running MCPDuckDBAgent:", err);
  } finally {
    // Clean up
    await agent.disconnect();
  }
})();
