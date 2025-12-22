import { NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { apiResponse, apiError, unauthorized, serverError } from "@/lib/api/helpers"
import { env } from "@/lib/env"

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication (optional - can allow anonymous for partner requests)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Get form data
    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return apiError("No file provided", 400)
    }

    // Validate file type
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]
    if (!allowedTypes.includes(file.type)) {
      return apiError("Invalid file type. Only PNG, JPG, SVG, and WebP are allowed", 400)
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024 // 5MB
    if (file.size > maxSize) {
      return apiError("File size too large. Maximum size is 5MB", 400)
    }

    // Generate unique filename
    const timestamp = Date.now()
    const randomString = Math.random().toString(36).substring(7)
    const fileExt = file.name.split(".").pop()
    const fileName = `logo-${timestamp}-${randomString}.${fileExt}`

    // Convert File to ArrayBuffer then to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(env.supabaseStorageBucket)
      .upload(fileName, buffer, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      })

    if (error) {
      console.error("Storage upload error:", error)
      return apiError("Failed to upload file", 500)
    }

    // Get public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from(env.supabaseStorageBucket).getPublicUrl(fileName)

    return apiResponse({
      success: true,
      url: publicUrl,
      filename: fileName,
      message: "Logo uploaded successfully",
    })
  } catch (error) {
    console.error("POST /api/upload/logo error:", error)
    return serverError()
  }
}

// Optional: DELETE endpoint to remove uploaded logos
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { searchParams } = new URL(request.url)
    const filename = searchParams.get("filename")

    if (!filename) {
      return apiError("Filename is required", 400)
    }

    const { error } = await supabase.storage.from(env.supabaseStorageBucket).remove([filename])

    if (error) {
      console.error("Storage delete error:", error)
      return apiError("Failed to delete file", 500)
    }

    return apiResponse({
      success: true,
      message: "Logo deleted successfully",
    })
  } catch (error) {
    console.error("DELETE /api/upload/logo error:", error)
    return serverError()
  }
}
