import { supabase } from "../supabase/supabase.js";

const BUCKET_NAME = "board-media";
const IMAGE_MAX_SIZE = 10 * 1024 * 1024;
const VIDEO_MAX_SIZE = 100 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

function sanitizePathPart(value) {
  const sanitized = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "default-board";
}

function getFileExtension(file) {
  const extensionMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov"
  };
  return extensionMap[file.type] || "bin";
}

function validateMediaFile(file) {
  if (!(file instanceof File)) throw new Error("ファイルが選択されていません。");
  const isImage = IMAGE_TYPES.includes(file.type);
  const isVideo = VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) {
    throw new Error("JPEG、PNG、WebP、GIF、MP4、WebM、MOV形式を選択してください。");
  }
  if (isImage && file.size > IMAGE_MAX_SIZE) throw new Error("画像は10MB以下にしてください。");
  if (isVideo && file.size > VIDEO_MAX_SIZE) throw new Error("動画は100MB以下にしてください。");
  return isImage ? "image" : "video";
}

export async function uploadMedia({ boardId, file }) {
  if (!boardId) throw new Error("ボードIDが指定されていません。");
  const mediaType = validateMediaFile(file);
  const extension = getFileExtension(file);
  const mediaId = crypto.randomUUID();
  const directory = mediaType === "image" ? "images" : "videos";
  const storagePath = [sanitizePathPart(boardId), directory, `${mediaId}.${extension}`].join("/");

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false
    });

  if (uploadError) throw new Error(`アップロードに失敗しました: ${uploadError.message}`);

  const { data: publicUrlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(uploadData.path);
  const publicUrl = publicUrlData?.publicUrl;
  if (!publicUrl) {
    await supabase.storage.from(BUCKET_NAME).remove([uploadData.path]);
    throw new Error("公開URLを取得できませんでした。");
  }

  return {
    mediaId,
    type: mediaType,
    url: publicUrl,
    storagePath: uploadData.path,
    fileName: file.name,
    contentType: file.type,
    fileSize: file.size
  };
}

export async function deleteMediaFile(storagePath) {
  if (!storagePath) throw new Error("削除対象のファイルパスがありません。");
  const { error } = await supabase.storage.from(BUCKET_NAME).remove([storagePath]);
  if (error) throw new Error(`ファイルの削除に失敗しました: ${error.message}`);
  return true;
}
