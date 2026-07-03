'use client'

import { useState } from 'react'

const questions = [
  // ── Provided 40 ────────────────────────────────────────────────────────────
  { cat:"Lakehouse", q:"What is the primary storage format used by Microsoft Fabric Lakehouse for Delta tables?", opts:["Parquet with Delta transaction log","CSV with schema file","Avro with Hive metastore","ORC with Spark catalog"], ans:0, expl:"Fabric Lakehouse stores Delta Lake tables as Parquet files accompanied by a Delta transaction log (_delta_log). This enables ACID transactions, time travel, and schema enforcement on top of open file formats." },
  { cat:"Lakehouse", q:"Which SQL endpoint in a Fabric Lakehouse allows read-only T-SQL queries against Delta tables?", opts:["Lakehouse Explorer","SQL analytics endpoint","Semantic model","Data pipeline"], ans:1, expl:"The SQL analytics endpoint provides a serverless T-SQL interface to query Delta tables in the Lakehouse. It is read-only — write operations must be done via Spark notebooks or pipelines." },
  { cat:"Lakehouse", q:"When you load a CSV file into the Lakehouse 'Files' section (not 'Tables'), which statement is TRUE?", opts:["It is automatically converted to Delta format","It is queryable via T-SQL without any transformation","It remains as a raw file and requires ingestion to become a table","It triggers an automatic schema scan"], ans:2, expl:"Files dropped into the 'Files' section of a Lakehouse remain as raw files. They are not automatically converted to Delta tables. You must explicitly load or transform them to create managed tables in the 'Tables' section." },
  { cat:"Lakehouse", q:"Which Fabric item automatically creates a semantic model on top of a Lakehouse?", opts:["Data pipeline","Dataflow Gen2","Default semantic model","Warehouse"], ans:2, expl:"Every Lakehouse automatically creates a default semantic model that mirrors its Delta tables. This semantic model can be consumed directly by Power BI without additional configuration." },
  { cat:"Lakehouse", q:"You need to enable time travel on a Delta table in a Fabric Lakehouse. What property controls how long history is retained?", opts:["delta.logRetentionDuration","delta.historyEnabled","spark.databricks.delta.retentionDurationCheck","delta.autoOptimize.enabled"], ans:0, expl:"The Delta Lake table property 'delta.logRetentionDuration' (default 30 days) controls how long the transaction log and old file versions are retained, enabling time travel with RESTORE and VERSION AS OF syntax." },
  { cat:"Lakehouse", q:"Which shortcut type allows a Fabric Lakehouse to query data stored in Azure Data Lake Storage Gen2 without copying it?", opts:["OneLake shortcut","ADLS Gen2 shortcut","External table","Mirror"], ans:1, expl:"An ADLS Gen2 shortcut in a Fabric Lakehouse creates a virtual reference to data in an external ADLS Gen2 account. The data stays in place — no copy is made — and it appears as a folder in the Lakehouse Files section." },
  { cat:"Pipelines", q:"In a Fabric Data Pipeline, which activity is used to move data between supported sources and sinks with schema mapping?", opts:["Notebook activity","Copy data activity","Dataflow activity","Get metadata activity"], ans:1, expl:"The Copy Data activity is the primary ETL activity in Fabric Data Pipelines. It supports a wide range of sources and sinks, handles schema mapping, and can copy data incrementally or fully." },
  { cat:"Pipelines", q:"A pipeline needs to execute only when a prior activity succeeds AND another condition returns True. Which control flow activity should you use?", opts:["ForEach","If Condition","Switch","Until"], ans:1, expl:"The 'If Condition' activity evaluates a boolean expression. Combined with activity dependency conditions, it lets you branch pipeline logic based on runtime conditions." },
  { cat:"Pipelines", q:"Which pipeline trigger type runs a pipeline on a recurring schedule, such as every day at 6 AM UTC?", opts:["Storage event trigger","Custom event trigger","Schedule trigger","Tumbling window trigger"], ans:2, expl:"A Schedule trigger fires a pipeline at specified times using a cron-like schedule. Tumbling window triggers are used when you need non-overlapping time intervals with dependency support." },
  { cat:"Pipelines", q:"What does the 'Get Metadata' activity return when targeting a folder in a Lakehouse?", opts:["Row count of Delta tables","List of child items (files/folders)","Schema of the first file","File size in bytes only"], ans:1, expl:"The Get Metadata activity on a folder returns a list of child items (files and subfolders). This is commonly used to dynamically iterate over files using a ForEach activity." },
  { cat:"Pipelines", q:"A Copy Data activity fails intermittently due to transient network errors. Which setting should you configure to automatically retry?", opts:["Timeout","Retry count","Degree of copy parallelism","Fault tolerance"], ans:1, expl:"The 'Retry' property on the Copy Data activity specifies how many times Fabric will automatically retry a failed activity before marking it as failed. You can also set a retry interval." },
  { cat:"Pipelines", q:"You want to pass a parameter value from a pipeline to a child pipeline. Which activity should you use?", opts:["Execute Pipeline activity","Invoke Function activity","Web activity","Script activity"], ans:0, expl:"The 'Execute Pipeline' activity invokes another pipeline and allows you to pass parameters to it. This is the standard pattern for modular, parameterized pipeline design in Fabric." },
  { cat:"Dataflow", q:"What generation of Dataflows in Microsoft Fabric writes output directly to a Lakehouse or Warehouse?", opts:["Dataflow Gen1","Dataflow Gen2","Power Query Online","Datamart"], ans:1, expl:"Dataflow Gen2 in Microsoft Fabric is designed for data integration and writes output to a Lakehouse, Warehouse, or other supported destinations. Gen1 wrote to a Power BI dataset only." },
  { cat:"Dataflow", q:"Dataflow Gen2 uses which underlying technology for data transformation logic?", opts:["T-SQL stored procedures","Power Query (M language)","PySpark notebooks","dbt models"], ans:1, expl:"Dataflow Gen2 is built on Power Query, using the M language for transformations. The Mashup engine executes the M expressions to transform and load data." },
  { cat:"Dataflow", q:"Which feature in Dataflow Gen2 allows you to see a preview of transformation results as you build each step?", opts:["Data profiling","Column quality view","Step-by-step preview in Power Query editor","Delta preview"], ans:2, expl:"The Power Query editor in Dataflow Gen2 provides a live data preview after each applied step, allowing you to verify transformation results interactively before publishing." },
  { cat:"Dataflow", q:"You need to merge data from two queries in Dataflow Gen2. Which transformation combines rows from a second query based on a matching key?", opts:["Append queries","Merge queries","Join tables","Union"], ans:1, expl:"'Merge queries' in Power Query performs a JOIN operation — combining columns from a second query based on a matching key column. 'Append queries' stacks rows (like UNION ALL)." },
  { cat:"Lakehouse", q:"What Spark SQL command would you run to optimize a Delta table in a Fabric Lakehouse by compacting small files?", opts:["COMPACT TABLE my_table","OPTIMIZE my_table","VACUUM my_table RETAIN 0 HOURS","ALTER TABLE my_table DEFRAG"], ans:1, expl:"The 'OPTIMIZE' command in Delta Lake compacts small Parquet files into larger ones, improving read performance. 'VACUUM' removes old file versions but does not compact files." },
  { cat:"Lakehouse", q:"After running OPTIMIZE, you want to remove data files no longer referenced by the Delta table. Which command achieves this?", opts:["OPTIMIZE ... PURGE","VACUUM my_table","DROP UNUSED FILES","CLEAN TABLE my_table"], ans:1, expl:"VACUUM removes Parquet files no longer referenced by the Delta transaction log. By default it keeps files newer than 7 days. You can override with RETAIN N HOURS." },
  { cat:"Warehouse", q:"In a Fabric Warehouse, which statement is TRUE about the SQL endpoint compared to a Lakehouse SQL endpoint?", opts:["Both are read-only","Warehouse supports full DML (INSERT, UPDATE, DELETE)","Warehouse only supports SELECT statements","Lakehouse supports DML but Warehouse does not"], ans:1, expl:"A Fabric Warehouse supports full T-SQL DML operations including INSERT, UPDATE, DELETE, and MERGE. The Lakehouse SQL analytics endpoint is read-only for T-SQL." },
  { cat:"Warehouse", q:"Which distribution strategy in a Fabric Warehouse spreads rows evenly across distributions using a hash function on a specified column?", opts:["Round-robin","Hash","Replicated","Partitioned"], ans:1, expl:"Hash distribution distributes table rows across distributions by applying a hash function to the specified column value. Optimal for large fact tables where you frequently join on the hashed column." },
  { cat:"Security", q:"Which Fabric role allows a user to read data from a Lakehouse but not modify workspace items?", opts:["Admin","Member","Contributor","Viewer"], ans:3, expl:"The 'Viewer' role grants read-only access to workspace items. Users can view reports and query data but cannot create, edit, or delete workspace items." },
  { cat:"Security", q:"Row-Level Security (RLS) in a Fabric Warehouse is implemented using which objects?", opts:["Column masks and sensitivity labels","Security policies and predicates","Row filters in semantic model","Dynamic data masking only"], ans:1, expl:"RLS in Fabric Warehouse uses security predicate functions and security policies. A filter predicate filters rows; a block predicate prevents writes. The policy applies transparently to all queries." },
  { cat:"Security", q:"What is the purpose of Dynamic Data Masking (DDM) in a Fabric Warehouse?", opts:["Encrypts data at rest","Limits exposure of sensitive data by masking it in query results","Prevents unauthorized row access","Audits all queries on a column"], ans:1, expl:"Dynamic Data Masking hides sensitive data from non-privileged users in query results without changing the stored data. Privileged users see the real values." },
  { cat:"Security", q:"Which Fabric feature allows you to classify and label sensitive data (e.g., Confidential, PII) across items?", opts:["Purview information protection labels","Column-level encryption","Row security tags","Workspace sensitivity filters"], ans:0, expl:"Microsoft Purview Information Protection sensitivity labels can be applied to Fabric items to classify and protect sensitive data. Labels can trigger protection actions like encryption on export." },
  { cat:"OneLake", q:"What is OneLake in Microsoft Fabric?", opts:["A managed Spark cluster","A single, unified data lake storage for all Fabric workloads","An ETL pipeline tool","A reporting layer over Azure Synapse"], ans:1, expl:"OneLake is the single, logical data lake underlying all Microsoft Fabric workloads. Built on ADLS Gen2, it provides a unified namespace for all Fabric items." },
  { cat:"OneLake", q:"OneLake uses which underlying Azure storage technology?", opts:["Azure Blob Storage","Azure Data Lake Storage Gen1","Azure Data Lake Storage Gen2","Azure Files"], ans:2, expl:"OneLake is built on Azure Data Lake Storage Gen2, leveraging its hierarchical namespace, security features, and scalability." },
  { cat:"OneLake", q:"Which OneLake feature allows Fabric items to reference data in external storage (AWS S3, ADLS, GCS) without copying it?", opts:["Mirroring","Shortcuts","Data sharing","Cross-region replication"], ans:1, expl:"OneLake shortcuts create references to data in external storage systems. The data stays in the external system but appears as a folder in the Lakehouse, enabling zero-copy data access." },
  { cat:"Pipelines", q:"In a Fabric Data Pipeline, which expression retrieves the output of a previous activity named 'GetFiles'?", opts:["@pipeline().parameters.GetFiles","@activity('GetFiles').output","@variables('GetFiles')","@trigger().outputs.GetFiles"], ans:1, expl:"Pipeline expressions use @activity('ActivityName').output to reference the output of a preceding activity. For example, @activity('GetFiles').output.childItems retrieves child items from a Get Metadata activity." },
  { cat:"Notebooks", q:"What is the primary language used in Fabric Spark notebooks for data engineering?", opts:["Only SQL","Python (PySpark), Scala, R, and SQL","Java only","C# and F#"], ans:1, expl:"Fabric Spark notebooks support Python (PySpark), Scala, R, and SQL. You can switch languages per cell using magic commands like %%sql or %%scala." },
  { cat:"Notebooks", q:"Which magic command in a Fabric notebook runs the cell content as Spark SQL?", opts:["%%python","%%sql","%%pyspark","%%sparksql"], ans:1, expl:"The '%%sql' magic command tells the Spark kernel to execute the cell as Spark SQL. This lets you mix SQL and Python in different cells of the same notebook." },
  { cat:"Notebooks", q:"You want to read a Delta table named 'sales' from the default Lakehouse in a Fabric notebook. Which PySpark line is correct?", opts:["df = spark.read.csv('sales')","df = spark.read.format('delta').load('/tables/sales')","df = spark.read.table('sales')","df = pd.read_delta('sales')"], ans:2, expl:"spark.read.table('sales') reads a Delta table by name from the attached Lakehouse's default catalog. It is the simplest approach in Fabric notebooks." },
  { cat:"Monitoring", q:"Which Fabric hub allows you to monitor the run history of pipelines, dataflows, and notebooks across a workspace?", opts:["Capacity metrics app","Monitor hub","Admin portal","Workspace settings"], ans:1, expl:"The Monitor hub provides a unified view of run history for activities across a workspace, including pipelines, dataflows, notebooks, and Spark jobs." },
  { cat:"Monitoring", q:"What tool provides administrators with visibility into capacity utilization (CU consumption) across all Fabric workloads?", opts:["Monitor hub","Microsoft Fabric Capacity Metrics app","Azure Cost Management","Power BI usage metrics report"], ans:1, expl:"The Microsoft Fabric Capacity Metrics app allows capacity administrators to monitor CU consumption, identify throttling, and understand which workloads consume the most resources." },
  { cat:"Lakehouse", q:"Which table format is natively supported by Fabric Lakehouse for ACID transactions and schema evolution?", opts:["Apache Iceberg","Apache Hudi","Delta Lake","Apache ORC"], ans:2, expl:"Microsoft Fabric Lakehouse natively uses Delta Lake format for all managed tables, providing ACID transactions, schema enforcement, schema evolution, and time travel." },
  { cat:"Dataflow", q:"Dataflow Gen2 supports staging. What is the purpose of the staging Lakehouse in Gen2?", opts:["It stores transformation scripts","It acts as an intermediate buffer to improve performance during data loading","It is the final output destination","It stores error logs from failed runs"], ans:1, expl:"Dataflow Gen2 uses a staging Lakehouse as an intermediate buffer. Data lands in staging before being written to the final destination, improving reliability and enabling larger data volumes." },
  { cat:"Warehouse", q:"In Fabric Warehouse, which command creates a table from the result of a SELECT query?", opts:["INSERT INTO ... SELECT","CREATE TABLE AS SELECT (CTAS)","SELECT INTO","COPY INTO"], ans:1, expl:"CTAS creates a new table populated with the results of a SELECT query. It is highly efficient for creating transformed or aggregated tables and supports distribution and partition options." },
  { cat:"Security", q:"Which permission allows a user to connect to a Fabric Warehouse SQL endpoint using SSMS?", opts:["Workspace Viewer role only","ReadAll item permission or higher on the Warehouse","Admin role only","Power BI Pro license only"], ans:1, expl:"To connect to a Fabric Warehouse via SSMS, a user needs at least ReadAll item permission on the Warehouse item, or a workspace role of Viewer or above." },
  { cat:"Pipelines", q:"You need to copy data only for records modified after the last pipeline run. Which approach enables incremental copy in Fabric pipelines?", opts:["Full load on each run","Watermark pattern using a Last Modified timestamp column","Event-based trigger only","Delta table time travel exclusively"], ans:1, expl:"The watermark pattern stores the max timestamp from the last successful run, then filters the source query using WHERE ModifiedDate > lastWatermark. This is the standard incremental load pattern." },
  { cat:"Lakehouse", q:"Which Fabric Lakehouse feature allows you to query a Delta table as it existed at a previous point in time?", opts:["VACUUM RETAIN","Schema drift","Time travel (VERSION AS OF / TIMESTAMP AS OF)","Checkpoint restore"], ans:2, expl:"Delta Lake time travel lets you query historical versions using 'VERSION AS OF' or 'TIMESTAMP AS OF' syntax. Useful for auditing, debugging, or recovering from accidental changes." },
  { cat:"OneLake", q:"Fabric Mirroring allows near-real-time replication of which external databases into OneLake?", opts:["Only Azure SQL Database","Azure SQL DB, Azure Cosmos DB, Snowflake, and more","Only on-premises SQL Server","Only Amazon Redshift"], ans:1, expl:"Fabric Mirroring supports Azure SQL Database, Azure Cosmos DB, Snowflake, Azure SQL Managed Instance, and more. It continuously replicates data into OneLake in Delta format with low latency." },
  { cat:"Lakehouse", q:"What is the role of the '_delta_log' folder in a Delta table stored in a Fabric Lakehouse?", opts:["It stores table statistics for query optimization","It is the transaction log containing all changes made to the table","It holds temporary files during OPTIMIZE operations","It stores column-level encryption keys"], ans:1, expl:"The '_delta_log' folder is the Delta transaction log — a series of JSON commit files recording every INSERT, UPDATE, DELETE, OPTIMIZE, and schema change. It enables ACID semantics and time travel." },

  // ── Additional questions ───────────────────────────────────────────────────
  { cat:"Notebooks", q:"What does the V-Order write optimization do in Fabric Lakehouse Parquet files?", opts:["Compresses files using LZ4 instead of Snappy","Applies sorting, distribution, and encoding to improve read performance in Power BI and SQL","Partitions files by date automatically","Encrypts column values at rest"], ans:1, expl:"V-Order is a Microsoft optimization applied during Parquet writes in Fabric. It sorts, distributes, and encodes data so that Power BI Direct Lake and Fabric SQL engines can read it with minimal CPU overhead." },
  { cat:"Real-Time", q:"Which Fabric item ingests streaming data from Azure Event Hubs or Kafka and routes it to multiple destinations?", opts:["Data pipeline","KQL Database","Eventstream","Real-Time hub"], ans:2, expl:"Eventstream captures, transforms, and routes real-time streaming data from sources like Event Hubs, Kafka, and IoT Hub to destinations such as a Lakehouse, KQL Database, or another Eventstream." },
  { cat:"Real-Time", q:"What query language is used to analyze data in a Fabric KQL (Kusto) Database?", opts:["T-SQL","PySpark","Kusto Query Language (KQL)","DAX"], ans:2, expl:"A KQL Database is queried using Kusto Query Language (KQL), which is optimized for time-series and log data analysis. It uses a pipe-based syntax like: table | where Timestamp > ago(1h) | summarize count()." },
  { cat:"Power BI", q:"Which Power BI connectivity mode reads data directly from OneLake Delta tables without import or aggregations, with sub-second query performance?", opts:["Import mode","DirectQuery mode","Direct Lake mode","Live connection"], ans:2, expl:"Direct Lake mode is unique to Fabric. It reads Delta Parquet files directly from OneLake into memory without import or DirectQuery overhead, providing near-import-speed performance at large scale." },
  { cat:"Power BI", q:"When does a Direct Lake semantic model fall back to DirectQuery mode?", opts:["When the dataset exceeds 1 GB","When guardrails are exceeded (e.g., too many unique values or tables), or when an unsupported DAX function is used","When the Lakehouse has more than 10 tables","Direct Lake never falls back to DirectQuery"], ans:1, expl:"Direct Lake falls back to DirectQuery when guardrails are hit — for example, when row counts exceed capacity limits, or when a DAX feature requires SQL fallback. This is transparent to report users." },
  { cat:"Warehouse", q:"Which T-SQL object in a Fabric Warehouse lets you expose a subset of table columns or rows to users?", opts:["Stored procedure","View","Trigger","Materialized view"], ans:1, expl:"Views in Fabric Warehouse allow you to define a virtual table from a SELECT statement. They can restrict columns (column-level security alternative) or filter rows to implement security or abstraction." },
  { cat:"Warehouse", q:"What is the maximum T-SQL row size limit to be aware of when designing Fabric Warehouse tables?", opts:["4 KB","8 KB","16 KB","64 KB"], ans:1, expl:"Fabric Warehouse follows the T-SQL row size limit of 8 KB for fixed-size columns. VARCHAR(MAX) and similar types store data off-row and are not counted against the 8 KB limit." },
  { cat:"Lakehouse", q:"In a Fabric Lakehouse, what is the difference between a managed table and an external table?", opts:["Managed tables are read-only; external tables support writes","Managed tables store data in OneLake under the Lakehouse; external tables reference data at an external URI","External tables are always faster than managed tables","There is no difference — both are stored the same way"], ans:1, expl:"Managed tables store their data inside the Lakehouse's OneLake location. External tables point to data at an external path (e.g., a shortcut or ADLS URI); dropping an external table does not delete the underlying data." },
  { cat:"Architecture", q:"In a Medallion Architecture implemented in Fabric, which layer stores raw, unmodified source data?", opts:["Gold","Silver","Bronze","Platinum"], ans:2, expl:"The Bronze layer holds raw, unmodified data exactly as it arrived from the source. Silver applies cleansing and conforming. Gold contains curated, aggregated data optimized for reporting." },
  { cat:"Architecture", q:"Which Fabric workspace role can assign a capacity to a workspace?", opts:["Viewer","Contributor","Member","Admin"], ans:3, expl:"Only the workspace Admin can assign or change the capacity associated with a workspace. Contributors and Members can create items but cannot modify workspace-level settings." },
  { cat:"Notebooks", q:"You want to write a DataFrame to a Delta table in the Lakehouse from a Fabric notebook, overwriting existing data. Which PySpark code is correct?", opts:["df.write.format('delta').mode('append').saveAsTable('my_table')","df.write.format('delta').mode('overwrite').saveAsTable('my_table')","df.to_delta('my_table', mode='overwrite')","df.write.csv('/tables/my_table')"], ans:1, expl:"df.write.format('delta').mode('overwrite').saveAsTable('my_table') writes the DataFrame to a managed Delta table in the attached Lakehouse, replacing existing data. Use mode('append') to add rows." },
  { cat:"Notebooks", q:"Which Fabric notebook feature allows multiple users to edit and run the same notebook simultaneously?", opts:["Notebook snapshots","Live collaboration (co-authoring)","Notebook versioning","Workspace sharing"], ans:1, expl:"Fabric notebooks support live co-authoring, allowing multiple users to edit cells and see each other's cursors in real time, similar to collaborative document editing." },
  { cat:"Spark", q:"What Spark configuration setting controls how many executor cores are allocated per task in a Fabric Spark job?", opts:["spark.executor.memory","spark.default.parallelism","spark.task.cpus","spark.executor.cores"], ans:3, expl:"spark.executor.cores defines how many CPU cores each Spark executor uses. In Fabric, the Starter Pool provides auto-scaling; for custom pools, you can configure executor size explicitly." },
  { cat:"Spark", q:"Which Fabric Spark pool type starts immediately without a cold start delay, using pre-warmed nodes?", opts:["Custom pool","Starter pool","Reserved pool","Serverless pool"], ans:1, expl:"The Starter Pool is a pre-warmed shared Spark pool that starts in seconds with no cold start. Custom pools are dedicated but have longer startup times." },
  { cat:"Spark", q:"You want to run a Fabric notebook on a schedule. Which Fabric feature enables this?", opts:["Schedule trigger in a Data Pipeline","Notebook scheduling via the notebook settings","Both A and B are valid","Only Airflow can schedule notebooks"], ans:2, expl:"Notebooks can be scheduled directly from the notebook UI (built-in schedule). You can also invoke notebooks via a Data Pipeline Notebook activity with a schedule trigger — both approaches are valid." },
  { cat:"Pipelines", q:"Which Fabric pipeline activity can invoke an Azure Function or REST API endpoint?", opts:["Script activity","Web activity","Execute Pipeline activity","Lookup activity"], ans:1, expl:"The Web activity sends an HTTP request to a REST endpoint, including Azure Functions, webhooks, and other APIs. It supports GET, POST, PUT, DELETE and can pass authentication headers." },
  { cat:"Pipelines", q:"What does the 'Lookup' activity return in a Fabric Data Pipeline?", opts:["List of files in a folder","The first row or all rows from a dataset query","The schema of a table","Row count only"], ans:1, expl:"The Lookup activity runs a query and returns the result set. By default it returns the first row; with 'First row only' unchecked, it returns all rows as an array usable by ForEach." },
  { cat:"OneLake", q:"What is the OneLake file path format used to access a Lakehouse table from within a Fabric notebook?", opts:["abfss://<workspace>@onelake.dfs.fabric.microsoft.com/<lakehouse>.Lakehouse/Tables/<table>","https://onelake.dfs.fabric.microsoft.com/<table>","wasbs://<workspace>/<lakehouse>/Tables/<table>","s3a://onelake/<workspace>/<lakehouse>/Tables/<table>"], ans:0, expl:"OneLake uses the ABFS (Azure Blob File System) URI scheme: abfss://<workspace-id>@onelake.dfs.fabric.microsoft.com/<item-id>/Tables/<table-name>. This is the standard path for Spark reads in Fabric." },
  { cat:"Security", q:"Column-Level Security (CLS) in Fabric Warehouse is enforced by GRANT/DENY on which object?", opts:["Row filter policy","Column permission on the table","Sensitivity label","View definition"], ans:1, expl:"Column-level security in Fabric Warehouse is implemented by granting SELECT on specific columns and denying SELECT on others using T-SQL: GRANT SELECT (col1, col2) ON dbo.table TO [user]. Users cannot see denied columns." },
  { cat:"Dataflow", q:"Which source connector in Dataflow Gen2 allows you to pull data from a Fabric Lakehouse Delta table?", opts:["Azure SQL Database connector","Lakehouse connector","OneDrive connector","Generic ADLS connector"], ans:1, expl:"Dataflow Gen2 includes a native Lakehouse connector that lets you select tables or files from any Fabric Lakehouse in your tenant as a data source." },
  { cat:"Real-Time", q:"What is the Fabric Real-Time Hub used for?", opts:["Scheduling batch pipeline runs","A centralized catalog for discovering and connecting to streaming data sources across the organization","Monitoring KQL query performance","Configuring Eventstream routing rules only"], ans:1, expl:"The Real-Time Hub is a central registry where users can discover, connect to, and subscribe to streaming data sources — including Microsoft sources (Teams, Azure Event Hubs) and third-party streams — making real-time data shareable across teams." },
  { cat:"Lakehouse", q:"Which Fabric feature allows you to integrate a Lakehouse with Git (Azure DevOps or GitHub) for version control of workspace items?", opts:["Workspace settings → Git integration","Fabric Deployment Pipelines","OneLake sync","Data pipeline export"], ans:0, expl:"Fabric supports Git integration at the workspace level (via Workspace Settings → Git integration). This allows you to sync Fabric items — including notebooks, pipelines, and definitions — with a Git repository." },
  { cat:"Architecture", q:"In the context of Microsoft Fabric, what is a 'capacity'?", opts:["A storage quota limit for a Lakehouse","A set of compute resources (CU) purchased and assigned to workspaces","A specific SKU of the Spark runtime","A Power BI report server instance"], ans:1, expl:"A Fabric capacity is a set of provisioned compute units (CUs) that power all Fabric workloads. You purchase capacity in Azure (F-SKUs or P-SKUs) and assign one capacity to one or more workspaces." },
  { cat:"Warehouse", q:"In a Fabric Warehouse, which schema organizes system catalog views (e.g., tables listing all tables and columns)?", opts:["dbo","sys","information_schema","fabric_catalog"], ans:2, expl:"Fabric Warehouse exposes INFORMATION_SCHEMA views (e.g., INFORMATION_SCHEMA.TABLES, INFORMATION_SCHEMA.COLUMNS) for querying metadata about user-defined objects, following the SQL standard." },
  { cat:"Pipelines", q:"Which Fabric pipeline activity iterates over a collection of items and executes inner activities for each item?", opts:["Until","Switch","ForEach","If Condition"], ans:2, expl:"The ForEach activity iterates over an array (e.g., a list of files from Get Metadata) and executes inner activities for each element. You can run iterations sequentially or in parallel (up to 50 concurrent)." },
  { cat:"Notebooks", q:"What is the purpose of the mssparkutils.notebook.run() function in a Fabric notebook?", opts:["It reads a Delta table into a DataFrame","It runs another notebook as a child process and returns its exit value","It runs a SQL query against the Warehouse","It starts a new Spark session"], ans:1, expl:"mssparkutils.notebook.run('notebookName', params={}) runs another notebook as a child notebook and waits for its completion, returning the exit value. This enables notebook chaining and modular notebook design." },
  { cat:"Dataflow", q:"In Dataflow Gen2, what does 'incremental refresh' allow you to do?", opts:["Refresh only the tables that changed","Refresh only rows newer than a specified date/time, without reloading historical data","Run the dataflow on a sliding 30-day window","Partially refresh columns"], ans:1, expl:"Incremental refresh in Dataflow Gen2 allows you to define a date/time range so only new or changed rows are refreshed. Historical data is retained and not reprocessed, reducing refresh duration and cost." },
  { cat:"OneLake", q:"What protocol does OneLake support for third-party tool access (e.g., Azure Storage Explorer, Databricks)?", opts:["REST API only","ABFS (Azure Blob File System) / ADLS Gen2 API","NFS v4","HDFS protocol"], ans:1, expl:"OneLake is compatible with the ADLS Gen2 API (ABFS protocol). Any tool that supports Azure Data Lake Storage Gen2 — like Azure Storage Explorer, ADF, Databricks, or Synapse — can read/write OneLake directly." },
  { cat:"Security", q:"A new workspace is created in Fabric. Who automatically becomes the workspace Admin?", opts:["The Fabric tenant admin","The user who created the workspace","All members of the Microsoft 365 group","A service principal configured in admin settings"], ans:1, expl:"The user who creates a workspace in Fabric is automatically assigned the Admin role for that workspace. The creator can then add other users and assign them roles." },
  { cat:"Lakehouse", q:"Which PySpark API is used in Fabric notebooks to read from a SQL analytics endpoint query (not a table name)?", opts:["spark.read.table()","spark.read.format('jdbc')","spark.sql()","spark.read.delta()"], ans:1, expl:"To execute an arbitrary T-SQL query via the Lakehouse SQL analytics endpoint from a notebook, you use JDBC: spark.read.format('jdbc').option('url', jdbc_url).option('query', sql).load(). For named Delta tables, spark.read.table() is simpler." },
  { cat:"Warehouse", q:"Which statement about cross-database queries in Fabric is correct?", opts:["Not supported — each Warehouse is isolated","You can query tables across different Warehouses and Lakehouses using three-part names (database.schema.table) or shortcuts","Cross-database queries require linked servers","Only Lakehouses support cross-database querying"], ans:1, expl:"In Fabric, you can query across Lakehouses and Warehouses in the same workspace using three-part naming: [lakehouse/warehouse_name].[schema].[table]. This enables unified reporting across multiple data stores." },
  { cat:"Spark", q:"Which Delta Lake operation Z-Orders a table on a specific column to improve data skipping?", opts:["OPTIMIZE my_table ZORDER BY (column)","CLUSTER BY (column)","REORDER TABLE my_table BY (column)","SORT TABLE my_table (column)"], ans:0, expl:"OPTIMIZE my_table ZORDER BY (column) reorganizes data so rows with similar values in the specified column are co-located in the same files, enabling the Delta engine to skip entire files during filtered queries." },
  { cat:"Real-Time", q:"Which Fabric item can trigger automated actions (e.g., send an email or start a pipeline) based on conditions detected in streaming data?", opts:["Eventstream","KQL Database","Data Activator","Real-Time Hub"], ans:2, expl:"Data Activator detects patterns or conditions in real-time data and triggers actions — such as sending Teams/email alerts or starting a Fabric pipeline — without writing code. It connects to Eventstream and Power BI reports." },
]

interface QState { selected: number | null; answered: boolean }

export default function DP700Exam() {
  const [current, setCurrent] = useState(0)
  const [states, setStates] = useState<QState[]>(questions.map(() => ({ selected: null, answered: false })))
  const [showResults, setShowResults] = useState(false)

  const q = questions[current]
  const qs = states[current]

  function selectAnswer(idx: number) {
    if (qs.answered) return
    setStates(prev => prev.map((s, i) => i === current ? { selected: idx, answered: true } : s))
  }

  function goTo(n: number) {
    setCurrent(Math.max(0, Math.min(questions.length - 1, n)))
  }

  function retry() {
    setStates(questions.map(() => ({ selected: null, answered: false })))
    setCurrent(0)
    setShowResults(false)
  }

  const answeredCount = states.filter(s => s.answered).length
  const correct = states.filter((s, i) => s.answered && s.selected === questions[i].ans).length
  const wrong = states.filter((s, i) => s.answered && s.selected !== questions[i].ans).length
  const skipped = questions.length - answeredCount
  const score = Math.round((correct / questions.length) * 100)
  const passed = score >= 70
  const progress = Math.round((answeredCount / questions.length) * 100)

  function optionStyle(idx: number) {
    if (!qs.answered) return 'border-gray-200 bg-white hover:bg-indigo-50 hover:border-indigo-300 cursor-pointer'
    if (idx === q.ans) return 'border-green-500 bg-green-50 text-green-800 cursor-default'
    if (idx === qs.selected && qs.selected !== q.ans) return 'border-red-400 bg-red-50 text-red-800 cursor-default'
    return 'border-gray-200 bg-gray-50 text-gray-400 cursor-default'
  }

  const CATS = [...new Set(questions.map(q => q.cat))]
  const catColors: Record<string, string> = {}
  const palette = ['indigo','violet','teal','amber','rose','sky','emerald','orange','fuchsia','cyan']
  CATS.forEach((c, i) => { catColors[c] = palette[i % palette.length] })

  if (showResults) {
    return (
      <div className="min-h-screen bg-slate-50 py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className={`px-8 py-10 text-center ${passed ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-bold mb-4 ${passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {passed ? '✓ PASSED' : '✗ FAILED'}
              </div>
              <div className={`text-7xl font-black mb-1 ${passed ? 'text-green-600' : 'text-red-500'}`}>{score}%</div>
              <p className="text-gray-500 text-sm">Passing score is 70%</p>
            </div>
            <div className="px-8 py-6">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="text-center p-4 bg-green-50 rounded-xl">
                  <div className="text-3xl font-bold text-green-600">{correct}</div>
                  <div className="text-xs text-gray-500 mt-1">Correct</div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-xl">
                  <div className="text-3xl font-bold text-red-500">{wrong}</div>
                  <div className="text-xs text-gray-500 mt-1">Wrong</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-xl">
                  <div className="text-3xl font-bold text-gray-400">{skipped}</div>
                  <div className="text-xs text-gray-500 mt-1">Skipped</div>
                </div>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Score</span><span>{correct} / {questions.length}</span>
                </div>
                <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${passed ? 'bg-green-500' : 'bg-red-400'}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
              <button
                onClick={retry}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors"
              >
                Retry Exam
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-indigo-700 text-white px-4 py-4 shadow-md">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-base sm:text-lg font-bold leading-tight truncate">DP-700: Microsoft Fabric Data Engineer — Practice Exam</h1>
            <p className="text-indigo-300 text-xs mt-0.5">{questions.length} questions · 70% to pass</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="flex items-center gap-1 text-sm font-semibold text-green-300">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
              {correct}
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold text-red-300">
              <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
              {wrong}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-indigo-100">
        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Progress text */}
        <div className="flex items-center justify-between text-xs text-gray-400 mb-4">
          <span>Question {current + 1} of {questions.length}</span>
          <span>{progress}% complete</span>
        </div>

        {/* Question card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-4">
          {/* Category badge */}
          <div className="px-6 pt-5 pb-0">
            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full bg-${catColors[q.cat]}-100 text-${catColors[q.cat]}-700 mb-3`}>
              {q.cat}
            </span>
          </div>

          {/* Question text */}
          <div className="px-6 pb-5">
            <p className="text-gray-800 font-medium text-base leading-relaxed mb-5">{q.q}</p>

            {/* Options */}
            <div className="space-y-2.5">
              {q.opts.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => selectAnswer(idx)}
                  className={`w-full text-left flex items-start gap-3 px-4 py-3 rounded-xl border-2 transition-all ${optionStyle(idx)}`}
                >
                  <span className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold mt-0.5 border-current">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="text-sm leading-relaxed">{opt}</span>
                </button>
              ))}
            </div>

            {/* Explanation */}
            {qs.answered && (
              <div className={`mt-4 p-4 rounded-xl text-sm leading-relaxed border ${qs.selected === q.ans ? 'bg-green-50 border-green-200 text-green-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                <span className="font-semibold">{qs.selected === q.ans ? '✓ Correct! ' : '✗ Incorrect. '}</span>
                {q.expl}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => goTo(current - 1)}
            disabled={current === 0}
            className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Prev
          </button>

          {/* Question dots (small screen: compact) */}
          <div className="flex gap-1 flex-wrap justify-center max-w-xs">
            {questions.map((_, i) => {
              const s = states[i]
              let bg = 'bg-gray-200'
              if (s.answered) bg = s.selected === questions[i].ans ? 'bg-green-400' : 'bg-red-400'
              if (i === current) bg = 'bg-indigo-500 ring-2 ring-indigo-300'
              return (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  className={`w-2.5 h-2.5 rounded-full transition-all ${bg}`}
                  title={`Q${i + 1}`}
                />
              )
            })}
          </div>

          {current === questions.length - 1 ? (
            <button
              onClick={() => setShowResults(true)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              Finish →
            </button>
          ) : (
            <button
              onClick={() => goTo(current + 1)}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors"
            >
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
