import duckdb from "duckdb";

const db = new duckdb.Database("./database/data.duckdb");
const con = db.connect();

const parquetPath = "./yellow_tripdata_2022-01.parquet";
const tableName = "tripdata";

con.run(`CREATE TABLE ${tableName} AS SELECT * FROM read_parquet('${parquetPath}')`, (err) => {
  if (err) {
    console.error("❌ Error importing Parquet:", err);
  } else {
    console.log(`✅ Parquet imported successfully into table '${tableName}'`);
  }
  con.close();
});
