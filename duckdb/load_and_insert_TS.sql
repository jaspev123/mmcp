-- Load the Parquet file
CREATE OR REPLACE TABLE my_data AS
--SELECT * FROM read_parquet('https://blobs.duckdb.org/data/taxi_2019_04.parquet');
SELECT * FROM 'yellow_tripdata_2022-01.parquet';

INSTALL postgres;
LOAD postgres;
select count(*) from my_data;
ATTACH 'dbname=timescaledb user=user password=password host=127.0.0.1 port=5433' AS timescaledb (TYPE postgres, SCHEMA 'public');
CALL postgres_execute('timescaledb', 'drop table if exists taxidata;');
CREATE TABLE timescaledb.public.taxidata AS
SELECT * FROM my_data;
SELECT * FROM postgres_query('timescaledb', 'SELECT count(*) FROM taxidata as taxidata_count');
