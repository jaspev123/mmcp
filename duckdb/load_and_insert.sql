-- Load the Parquet file
CREATE OR REPLACE TABLE my_data AS
--SELECT * FROM read_parquet('https://blobs.duckdb.org/data/taxi_2019_04.parquet');
SELECT * FROM 'yellow_tripdata_2022-01.parquet';

INSTALL postgres;
LOAD postgres;
select count(*) from my_data;
ATTACH 'dbname=mydb user=user password=password host=127.0.0.1' AS pgdb (TYPE postgres, SCHEMA 'public');
CALL postgres_execute('pgdb', 'drop table if exists taxidata;');
CREATE TABLE pgdb.public.taxidata AS
SELECT * FROM my_data;
SELECT * FROM postgres_query('pgdb', 'SELECT count(*) FROM taxidata as taxidata_count');
