import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'react-native';

const KB = 1024;
export const IMAGE_UPLOAD_LIMIT = 500 * KB;
export const READABLE_IMAGE_LIMIT = 800 * KB;
export const DOCUMENT_UPLOAD_LIMIT = 5 * 1024 * KB;

const imageDimensions = (uri: string) => new Promise<{ width: number; height: number }>((resolve, reject) => {
  Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
});

export async function localFileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists || typeof info.size !== 'number') throw new Error('The selected file could not be read.');
  return info.size;
}

export async function optimizeImage(uri: string, maxBytes = IMAGE_UPLOAD_LIMIT): Promise<{ uri: string; size: number }> {
  const { width } = await imageDimensions(uri);
  const widths = maxBytes > IMAGE_UPLOAD_LIMIT ? [2400, 2200, 2000, 1800] : [2000, 1600, 1280, 1000];
  const qualities = maxBytes > IMAGE_UPLOAD_LIMIT ? [0.9, 0.88, 0.85, 0.82] : [0.84, 0.78, 0.72, 0.68];
  let best: { uri: string; size: number } | null = null;

  for (let i = 0; i < widths.length; i++) {
    const targetWidth = Math.min(width, widths[i]);
    const result = await manipulateAsync(
      uri,
      targetWidth < width ? [{ resize: { width: targetWidth } }] : [],
      { format: SaveFormat.JPEG, compress: qualities[i] },
    );
    const candidate = { uri: result.uri, size: await localFileSize(result.uri) };
    if (!best || candidate.size < best.size) best = candidate;
    if (candidate.size <= maxBytes) return candidate;
  }

  throw new Error(`This image is still ${Math.ceil((best?.size || 0) / KB)} KB after compression. Please choose a clearer, smaller photo.`);
}

export async function validateDocument(uri: string, maxBytes = DOCUMENT_UPLOAD_LIMIT): Promise<number> {
  const size = await localFileSize(uri);
  if (size > maxBytes) {
    throw new Error(`This document is ${Math.ceil(size / KB)} KB. Please choose a file under ${Math.round(maxBytes / 1024 / KB)} MB or export a smaller PDF.`);
  }
  return size;
}

export async function uploadOptimizedImage(options: {
  uri: string;
  fileName: string;
  token: string;
  supabaseUrl: string;
  anonKey: string;
  maxBytes?: number;
  prepared?: boolean;
}): Promise<string> {
  const image = options.prepared
    ? { uri: options.uri, size: await localFileSize(options.uri) }
    : await optimizeImage(options.uri, options.maxBytes);
  if (image.size > (options.maxBytes ?? IMAGE_UPLOAD_LIMIT)) throw new Error('The optimized photo is too large to upload.');
  const uploadUrl = `${options.supabaseUrl}/storage/v1/object/incident-reports/${options.fileName}`;
  const result = await FileSystem.uploadAsync(uploadUrl, image.uri, {
    httpMethod: 'POST',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${options.token}`,
      apikey: options.anonKey,
      'Content-Type': 'image/jpeg',
    },
  });
  if (result.status !== 200 && result.status !== 201) throw new Error('Photo upload failed. Please try again.');
  return `${options.supabaseUrl}/storage/v1/object/public/incident-reports/${options.fileName}`;
}
