import express from "express";
import {createMcpServer} from "./duckdb-server44";

const app = express();
app.use(express.json());

let transport : any;


(async () => {
  // Initialize MCP once at startup
  ({ transport, } = await createMcpServer());

  app.post("/mcp", async (req, res) => {
    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("Error handling MCP request:", err);
      res.status(500).send("Internal Server Error");
    }
  });

  // Start the HTTP server
  app.listen(3001, () => console.log("MCP HTTP server listening on port 3001"));
})();