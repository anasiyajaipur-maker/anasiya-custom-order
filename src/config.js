export const config = {
  endpoint: import.meta.env.VITE_APPWRITE_ENDPOINT || `https://sgp.cloud.appwrite.io/v1`,
  projectId: import.meta.env.VITE_APPWRITE_PROJECT_ID || `6a454ec900060f12e3ec`,
  functionId: import.meta.env.VITE_APPWRITE_FUNCTION_ID || `anasiya-api`,
  databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID || `anasiya_custom_order`,
  bucketId: import.meta.env.VITE_APPWRITE_BUCKET_ID || `catalog-images`
};
