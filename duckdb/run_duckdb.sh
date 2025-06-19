#!/bin/bash
# Path to DuckDB binary
DUCKDB_BIN="$HOME/.duckdb/cli/latest/duckdb"
# Path to your DuckDB database file (or use :memory:)
DB_FILE=":memory:"
# Check that an argument (SQL script path) is provided
if [ -z "$1" ]; then
  echo "Usage: $0 <sql-script-file>"
  exit 1
fi
SQL_FILE="$1"
# Run the SQL script
$DUCKDB_BIN $DB_FILE < "$SQL_FILE"
