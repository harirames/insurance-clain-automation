import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export function isAllowedMimeType(mimeType: string): mimeType is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export async function uploadDocument(
  claimId: string,
  file: { name: string; bytes: Buffer; mimeType: AllowedMimeType }
): Promise<{ publicId: string; url: string; mimeType: string }> {
  const dataUri = `data:${file.mimeType};base64,${file.bytes.toString("base64")}`;
  const publicId = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_");

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: `claims/${claimId}`,
    resource_type: "auto",
    public_id: publicId,
    overwrite: false,
  });

  return {
    publicId: result.public_id,
    url: result.secure_url,
    mimeType: file.mimeType,
  };
}

export function getDocumentUrl(publicId: string): string {
  return cloudinary.url(publicId, { secure: true, sign_url: true });
}
