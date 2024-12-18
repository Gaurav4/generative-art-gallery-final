const { DynamoDBClient, ListTablesCommand, BillingMode, CreateTableCommand, waitUntilTableExists } = require("@aws-sdk/client-dynamodb");
const { PutCommand, UpdateCommand, GetCommand, DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const region = process.env.region;
const genai_table = "reinvent-generativeart-gallery";
const counter_table = "reinvent-generativeart-gallery-counter";

const ddb_client = new DynamoDBClient(region);
const doc_client = DynamoDBDocumentClient.from(ddb_client);

const BedrockLlm = new Map([
  ["Stable Diffusion", "stability.stable-diffusion-xl-v1"],
  ["Amazon Titan", "amazon.titan-image-generator-v1"],
  ["Amazon Titan V2", "amazon.titan-image-generator-v2:0"],
  ["Stable Diffusion 3 Large", "stability.sd3-large-v1:0"],
  ["Stable Image Ultra", "stability.stable-image-ultra-v1:0"],
  ["Stable Image Core", "stability.stable-image-core-v1:0"],
  ["Nova Canvas", "amazon.nova-canvas-v1:0"],

  ["Fine-Tuned Model", "arn:aws:bedrock:us-west-2:253490758946:provisioned-model/u66tkilspp3x"]
]);

async function getNextOrderNumber() {
    const params = {
        TableName: counter_table,
        Key: { 'id': 'counter' },
        UpdateExpression: 'SET orderNumber = if_not_exists(orderNumber, :start) + :incr',
        ExpressionAttributeValues: {
            ':start': 0,
            ':incr': 1
        },
        ReturnValues: 'UPDATED_NEW'
    };

    try {
        const result = await doc_client.send(new UpdateCommand(params));
        return result.Attributes.orderNumber;
    } catch (error) {
        console.error('Error updating counter:', error);
        throw error;
    }
}

async function initializeCounterTable() {
    try {
        const createCounterTable = new CreateTableCommand({
            TableName: counter_table,
            BillingMode: BillingMode.PAY_PER_REQUEST,
            KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
            AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }]
        });

        await ddb_client.send(createCounterTable);
        await waitUntilTableExists(
            { client: ddb_client, maxWaitTime: 60 }, 
            { TableName: counter_table }
        );

        // Initialize counter
        await doc_client.send(new PutCommand({
            TableName: counter_table,
            Item: {
                id: 'counter',
                orderNumber: 0
            },
            ConditionExpression: 'attribute_not_exists(id)'
        }));
    } catch (error) {
        if (!error.name === 'ResourceInUseException') {
            console.error('Error initializing counter table:', error);
            throw error;
        }
    }
}

const init = async () => {
    try {
        const listTables = await ddb_client.send(new ListTablesCommand({}));
        
        if (!listTables.TableNames.includes(genai_table)) {
            const createMainTable = new CreateTableCommand({
                TableName: genai_table,
                BillingMode: BillingMode.PAY_PER_REQUEST,
                KeySchema: [
                    { AttributeName: "id", KeyType: "HASH" },
                    { AttributeName: "sortkey", KeyType: "RANGE" }
                ],
                AttributeDefinitions: [
                    { AttributeName: "id", AttributeType: "S" },
                    { AttributeName: "sortkey", AttributeType: "S" }
                ]
            });

            await ddb_client.send(createMainTable);
            await waitUntilTableExists(
                { client: ddb_client, maxWaitTime: 60 }, 
                { TableName: genai_table }
            );
        }

        // Initialize counter table if it doesn't exist
        if (!listTables.TableNames.includes(counter_table)) {
            await initializeCounterTable();
        }
    } catch(error) {
        console.error("Error initializing tables:", error);
        throw error;
    }
};

const record_submission = async (uploadParams, s3filekey) => {
    try {
        const orderNumber = await getNextOrderNumber();
        const date = new Date();
        const sortkey = date.toISOString().replace(/\D/g, '');
        
        const command = new PutCommand({
            TableName: genai_table,
            Item: {
                id: s3filekey.split('/').pop().split('.')[0],
                sortkey: sortkey,
                modelid: BedrockLlm.get(uploadParams['model']),
                modelname: uploadParams['model'],
                prompt: uploadParams['prompt'],
                s3filepath: s3filekey,
                orderNumber: orderNumber,
                approved: false,
                expire: '1733529600'
            }
        });

        await doc_client.send(command);
        console.log(`Record submitted with orderNumber: ${orderNumber}`);
        return orderNumber;
    } catch (error) {
        console.error("Error recording submission:", error);
        throw error;
    }
};

module.exports = {
    init,
    record_submission,
    getNextOrderNumber
};