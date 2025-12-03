import { Storage } from "@google-cloud/storage";
import "dotenv/config";


let storageOptions: any = {
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
};

if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
  try {
    let keyString = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    // Handle Base64 encoded JSON
    if (!keyString.trim().startsWith("{")) {
      keyString = Buffer.from(keyString, 'base64').toString('utf-8');
    }
    const credentials = JSON.parse(keyString);
    storageOptions.credentials = credentials;
  } catch (error) {
    console.error("Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY:", error);
    // Fallback to default auth (will likely fail if this was the intended method)
  }
}

const storage = new Storage(storageOptions);

const BUCKET_NAME = process.env.GOOGLE_CLOUD_STORAGE_BUCKET || "instashorts-content";

const bucket = storage.bucket(BUCKET_NAME);


export async function uploadImageToGCS(
  imageBuffer: Buffer,
  fileName: string
): Promise<string> {
  const file = bucket.file(fileName);

  // Create a write stream and pipe the buffer to it
  const stream = file.createWriteStream({
    metadata: {
      contentType: "image/png", // Or 'image/jpeg' depending on output
    },
  });

  return new Promise((resolve, reject) => {
    stream.on("error", (err) => {
      reject(`Failed to upload to GCS: ${err.message}`);
    });

    stream.on("finish", async () => {
      // Note: With uniform bucket-level access enabled, individual file ACLs cannot be set
      // Make the bucket public at the bucket level if public access is needed
      // Or use signed URLs for private access

      // Return the public URL (will work if bucket is public, otherwise use signed URLs)
      resolve(`https://storage.googleapis.com/${BUCKET_NAME}/${fileName}`);
    });

    // Write the image buffer to the stream
    stream.end(imageBuffer);
  });
}

/**
 * Uploads a buffer to Google Cloud Storage with a custom bucket and destination
 * Returns the public URL of the uploaded file
 */
export async function uploadBufferToGCS(
  bucketName: string,
  buffer: Buffer,
  destination: string,
  contentType?: string
): Promise<string> {
  const targetBucket = storage.bucket(bucketName);
  const file = targetBucket.file(destination);

  // Create a write stream and pipe the buffer to it
  const stream = file.createWriteStream({
    metadata: {
      contentType: contentType || "application/octet-stream",
    },
  });

  return new Promise((resolve, reject) => {
    stream.on("error", (err) => {
      reject(`Failed to upload to GCS: ${err.message}`);
    });

    stream.on("finish", async () => {
      try {
        // Make the file publicly readable
        // await file.makePublic();

        // Return the public URL
        resolve(`https://storage.googleapis.com/${bucketName}/${destination}`);
      } catch (error: any) {
        // If makePublic fails (e.g., uniform bucket-level access), still return URL
        // console.warn(`Could not make file public: ${error.message}`);
        resolve(`https://storage.googleapis.com/${bucketName}/${destination}`);
      }
    });

    // Write the buffer to the stream
    stream.end(buffer);
  });
}