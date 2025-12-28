"use client"

import { useState, useCallback, useEffect, useRef, memo } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  BookOpen,
  Plus,
  Search,
  FileText,
  HelpCircle,
  ShoppingBag,
  FileCheck,
  Scroll,
  FileQuestion,
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  Tags,
  FolderOpen,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Upload,
  File,
  X,
} from "lucide-react"
import {
  useWorkspaceKnowledgeBase,
  useCreateKnowledgeDocument,
  useUpdateKnowledgeDocument,
  useDeleteKnowledgeDocument,
  useKnowledgeBaseCategories,
} from "@/lib/hooks/use-workspace-knowledge-base"
import type {
  KnowledgeDocument,
  KnowledgeDocumentType,
  KnowledgeDocumentStatus,
} from "@/types/database.types"
import { formatDistanceToNow } from "date-fns"

// ============================================================================
// CONSTANTS
// ============================================================================

const documentTypeConfig: Record<KnowledgeDocumentType, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  document: { icon: FileText, label: "Document", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  faq: { icon: HelpCircle, label: "FAQ", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  product_info: { icon: ShoppingBag, label: "Product Info", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
  policy: { icon: FileCheck, label: "Policy", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  script: { icon: Scroll, label: "Script", color: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" },
  other: { icon: FileQuestion, label: "Other", color: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400" },
}

const statusConfig: Record<KnowledgeDocumentStatus, { icon: React.ComponentType<{ className?: string }>; label: string; color: string }> = {
  draft: { icon: Clock, label: "Draft", color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  processing: { icon: RefreshCw, label: "Processing", color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
  active: { icon: CheckCircle2, label: "Active", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  archived: { icon: FolderOpen, label: "Archived", color: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" },
  error: { icon: XCircle, label: "Error", color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400" },
}

const SUPPORTED_FILE_TYPES = {
  "text/plain": ".txt",
  "text/markdown": ".md",
  "application/pdf": ".pdf",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// ============================================================================
// TYPES
// ============================================================================

interface FormData {
  title: string
  description: string
  document_type: KnowledgeDocumentType
  content: string
  category: string
  tags: string[]
}

// ============================================================================
// HOOKS
// ============================================================================

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

// ============================================================================
// EXTRACTED COMPONENTS (Outside main component to prevent re-creation)
// ============================================================================

// Document Card Component
const DocumentCard = memo(function DocumentCard({ 
  doc, 
  onView, 
  onEdit, 
  onDelete 
}: { 
  doc: KnowledgeDocument
  onView: (doc: KnowledgeDocument) => void
  onEdit: (doc: KnowledgeDocument) => void
  onDelete: (doc: KnowledgeDocument) => void
}) {
  const typeConf = documentTypeConfig[doc.document_type]
  const statusConf = statusConfig[doc.status]
  const TypeIcon = typeConf.icon
  const StatusIcon = statusConf.icon

  return (
    <Card className="group hover:shadow-md transition-shadow duration-200 border-border/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className={`p-2 rounded-lg shrink-0 ${typeConf.color}`}>
              <TypeIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base leading-tight truncate">{doc.title}</h3>
              {doc.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{doc.description}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(doc)}>
                <Eye className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onEdit(doc)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => onDelete(doc)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className={`text-xs ${statusConf.color} border-0`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {statusConf.label}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {typeConf.label}
          </Badge>
          {doc.category && (
            <Badge variant="outline" className="text-xs">
              <FolderOpen className="h-3 w-3 mr-1" />
              {doc.category}
            </Badge>
          )}
        </div>
        {doc.tags && doc.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {doc.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground"
              >
                <Tags className="h-2.5 w-2.5 mr-1" />
                {tag}
              </span>
            ))}
            {doc.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{doc.tags.length - 3} more</span>
            )}
          </div>
        )}
        <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
          </span>
          {doc.usage_count > 0 && (
            <span>Used {doc.usage_count} times</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
})

// Form Fields Component
const FormFields = memo(function FormFields({ 
  formData,
  tagInput,
  showContent = true,
  onFormChange,
  onTagInputChange,
  onAddTag,
  onRemoveTag,
}: { 
  formData: FormData
  tagInput: string
  showContent?: boolean
  onFormChange: (field: keyof FormData, value: string | string[] | KnowledgeDocumentType) => void
  onTagInputChange: (value: string) => void
  onAddTag: () => void
  onRemoveTag: (tag: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="form-title">Title *</Label>
        <Input
          id="form-title"
          placeholder="Enter document title"
          value={formData.title}
          onChange={(e) => onFormChange("title", e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-document-type">Document Type</Label>
        <Select
          value={formData.document_type}
          onValueChange={(v) => onFormChange("document_type", v as KnowledgeDocumentType)}
        >
          <SelectTrigger id="form-document-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(documentTypeConfig).map(([type, config]) => {
              const Icon = config.icon
              return (
                <SelectItem key={type} value={type}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {config.label}
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-description">Description</Label>
        <Textarea
          id="form-description"
          placeholder="Brief description of this document"
          value={formData.description}
          onChange={(e) => onFormChange("description", e.target.value)}
          rows={2}
        />
      </div>
      {showContent && (
        <div className="space-y-2">
          <Label htmlFor="form-content">Content *</Label>
          <Textarea
            id="form-content"
            placeholder="Enter the document content that your AI agents can reference..."
            value={formData.content}
            onChange={(e) => onFormChange("content", e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="form-category">Category</Label>
          <Input
            id="form-category"
            placeholder="e.g., Support, Sales"
            value={formData.category}
            onChange={(e) => onFormChange("category", e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="form-tags">Tags</Label>
          <div className="flex gap-2">
            <Input
              id="form-tags"
              placeholder="Add tag"
              value={tagInput}
              onChange={(e) => onTagInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  e.stopPropagation()
                  onAddTag()
                }
              }}
              autoComplete="off"
            />
            <Button type="button" variant="outline" size="icon" onClick={onAddTag}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      {formData.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {formData.tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="cursor-pointer hover:bg-destructive hover:text-destructive-foreground transition-colors"
              onClick={() => onRemoveTag(tag)}
            >
              {tag} ×
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
})

// File Upload Area Component
const FileUploadArea = memo(function FileUploadArea({
  uploadedFile,
  fileContent,
  isReadingFile,
  fileError,
  fileInputRef,
  onFileSelect,
  onRemoveFile,
}: {
  uploadedFile: File | null
  fileContent: string
  isReadingFile: boolean
  fileError: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveFile: () => void
}) {
  return (
    <div className="space-y-4">
      {!uploadedFile ? (
        <div
          className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const file = e.dataTransfer.files[0]
            if (file && fileInputRef.current) {
              const dt = new DataTransfer()
              dt.items.add(file)
              fileInputRef.current.files = dt.files
              onFileSelect({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>)
            }
          }}
        >
          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-4" />
          <p className="text-sm font-medium">Drop a file here or click to upload</p>
          <p className="text-xs text-muted-foreground mt-1">
            Supports .txt, .md, .pdf, .doc, .docx (max 10MB)
          </p>
        </div>
      ) : (
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <File className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{uploadedFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(uploadedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onRemoveFile}
              className="shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          {isReadingFile && (
            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Reading file content...
            </div>
          )}
          {fileContent && !isReadingFile && (
            <div className="mt-3 p-3 bg-muted/50 rounded-lg max-h-40 overflow-y-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap">{fileContent.slice(0, 500)}{fileContent.length > 500 ? "..." : ""}</pre>
            </div>
          )}
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".txt,.md,.pdf,.doc,.docx,text/plain,text/markdown,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={onFileSelect}
      />
      {fileError && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {fileError}
        </div>
      )}
    </div>
  )
})

// Loading Skeleton Component
const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {[...Array(6)].map((_, i) => (
        <Card key={i}>
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
})

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function KnowledgeBasePage() {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string

  // State
  const [searchInput, setSearchInput] = useState("")
  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [categoryFilter, setCategoryFilter] = useState<string>("all")

  // Debounced search query
  const debouncedSearch = useDebounce(searchInput, 300)

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [viewDocument, setViewDocument] = useState<KnowledgeDocument | null>(null)
  const [editDocument, setEditDocument] = useState<KnowledgeDocument | null>(null)
  const [deleteDocument, setDeleteDocument] = useState<KnowledgeDocument | null>(null)

  // Create dialog tab state
  const [createTab, setCreateTab] = useState<"text" | "upload">("text")

  // Form state
  const [formData, setFormData] = useState<FormData>({
    title: "",
    description: "",
    document_type: "document",
    content: "",
    category: "",
    tags: [],
  })
  const [tagInput, setTagInput] = useState("")

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [fileContent, setFileContent] = useState<string>("")
  const [isReadingFile, setIsReadingFile] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Data hooks
  const { data, isLoading, error, refetch } = useWorkspaceKnowledgeBase({
    search: debouncedSearch || undefined,
    documentType: typeFilter !== "all" ? (typeFilter as KnowledgeDocumentType) : undefined,
    status: statusFilter !== "all" ? (statusFilter as KnowledgeDocumentStatus) : undefined,
    category: categoryFilter !== "all" ? categoryFilter : undefined,
  })
  const categories = useKnowledgeBaseCategories()
  const createMutation = useCreateKnowledgeDocument()
  const updateMutation = useUpdateKnowledgeDocument()
  const deleteMutation = useDeleteKnowledgeDocument()

  // Callbacks
  const resetForm = useCallback(() => {
    setFormData({
      title: "",
      description: "",
      document_type: "document",
      content: "",
      category: "",
      tags: [],
    })
    setTagInput("")
    setUploadedFile(null)
    setFileContent("")
    setFileError(null)
    setCreateTab("text")
  }, [])

  const handleFormChange = useCallback((field: keyof FormData, value: string | string[] | KnowledgeDocumentType) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }, [])

  const handleTagInputChange = useCallback((value: string) => {
    setTagInput(value)
  }, [])

  const handleAddTag = useCallback(() => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }))
      setTagInput("")
    }
  }, [tagInput, formData.tags])

  const handleRemoveTag = useCallback((tag: string) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }))
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setFileError(null)

    if (!Object.keys(SUPPORTED_FILE_TYPES).includes(file.type) && !file.name.endsWith(".txt") && !file.name.endsWith(".md")) {
      setFileError("Unsupported file type. Please upload a .txt, .md, .pdf, .doc, or .docx file.")
      return
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError("File is too large. Maximum size is 10MB.")
      return
    }

    setUploadedFile(file)
    setIsReadingFile(true)

    if (file.type === "text/plain" || file.name.endsWith(".txt") || file.name.endsWith(".md")) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const content = event.target?.result as string
        setFileContent(content)
        setFormData((prev) => ({
          ...prev,
          title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
          content: content,
        }))
        setIsReadingFile(false)
      }
      reader.onerror = () => {
        setFileError("Failed to read file content.")
        setIsReadingFile(false)
      }
      reader.readAsText(file)
    } else {
      setFormData((prev) => ({
        ...prev,
        title: prev.title || file.name.replace(/\.[^/.]+$/, ""),
        content: `[File content will be extracted from: ${file.name}]`,
      }))
      setFileContent(`[File: ${file.name}]\n\nThis file type requires server-side processing to extract content.`)
      setIsReadingFile(false)
    }
  }, [])

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null)
    setFileContent("")
    setFileError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    setFormData((prev) => ({ ...prev, content: "" }))
  }, [])

  const handleView = useCallback((doc: KnowledgeDocument) => {
    setViewDocument(doc)
  }, [])

  const handleEdit = useCallback((doc: KnowledgeDocument) => {
    setFormData({
      title: doc.title,
      description: doc.description || "",
      document_type: doc.document_type,
      content: doc.content || "",
      category: doc.category || "",
      tags: doc.tags || [],
    })
    setEditDocument(doc)
  }, [])

  const handleDeleteClick = useCallback((doc: KnowledgeDocument) => {
    setDeleteDocument(doc)
  }, [])

  const handleCreate = useCallback(async () => {
    try {
      const contentToSave = createTab === "upload" ? fileContent : formData.content
      await createMutation.mutateAsync({
        title: formData.title,
        description: formData.description || undefined,
        document_type: formData.document_type,
        content: contentToSave || undefined,
        category: formData.category || undefined,
        tags: formData.tags,
        file_name: uploadedFile?.name,
        file_type: uploadedFile?.type,
        file_size_bytes: uploadedFile?.size,
      })
      setCreateDialogOpen(false)
      resetForm()
    } catch (error) {
      console.error("Failed to create document:", error)
    }
  }, [createMutation, formData, createTab, fileContent, uploadedFile, resetForm])

  const handleUpdate = useCallback(async () => {
    if (!editDocument) return
    try {
      await updateMutation.mutateAsync({
        id: editDocument.id,
        data: {
          title: formData.title,
          description: formData.description || null,
          document_type: formData.document_type,
          content: formData.content || null,
          category: formData.category || null,
          tags: formData.tags,
        },
      })
      setEditDocument(null)
      resetForm()
    } catch (error) {
      console.error("Failed to update document:", error)
    }
  }, [editDocument, updateMutation, formData, resetForm])

  const handleDelete = useCallback(async () => {
    if (!deleteDocument) return
    try {
      await deleteMutation.mutateAsync(deleteDocument.id)
      setDeleteDocument(null)
    } catch (error) {
      console.error("Failed to delete document:", error)
    }
  }, [deleteDocument, deleteMutation])

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Knowledge Base</h1>
          <p className="text-muted-foreground mt-1">
            Manage documents and information your AI agents can reference.
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Document
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(documentTypeConfig).map(([type, config]) => (
              <SelectItem key={type} value={type}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {Object.entries(statusConfig).map(([status, config]) => (
              <SelectItem key={status} value={status}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {categories.length > 0 && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Loading State */}
      {isLoading && <LoadingSkeleton />}

      {/* Error State */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold">Failed to load documents</h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              There was an error loading your knowledge base. Please try again.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && !error && data?.data?.length === 0 && (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="p-4 bg-primary/10 rounded-full mb-4">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">
              {searchInput || typeFilter !== "all" || statusFilter !== "all"
                ? "No documents found"
                : "No documents yet"}
            </h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              {searchInput || typeFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters or search query."
                : "Upload documents, FAQs, and product information to help your AI agents provide accurate answers."}
            </p>
            {!(searchInput || typeFilter !== "all" || statusFilter !== "all") && (
              <Button className="mt-6" onClick={() => setCreateDialogOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Create Document
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Documents Grid */}
      {data?.data && data.data.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.data.map((doc) => (
              <DocumentCard 
                key={doc.id} 
                doc={doc} 
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
              />
            ))}
          </div>
          <div className="text-center text-sm text-muted-foreground">
            Showing {data.data.length} of {data.total} documents
          </div>
        </>
      )}

      {/* Create Document Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        setCreateDialogOpen(open)
        if (!open) resetForm()
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Document</DialogTitle>
            <DialogDescription>
              Add a new document to your knowledge base for AI agents to reference.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as "text" | "upload")} className="mt-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Write Content
              </TabsTrigger>
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload File
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="text" className="mt-4">
              <FormFields
                formData={formData}
                tagInput={tagInput}
                showContent={true}
                onFormChange={handleFormChange}
                onTagInputChange={handleTagInputChange}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
              />
            </TabsContent>
            
            <TabsContent value="upload" className="mt-4 space-y-4">
              <FileUploadArea
                uploadedFile={uploadedFile}
                fileContent={fileContent}
                isReadingFile={isReadingFile}
                fileError={fileError}
                fileInputRef={fileInputRef}
                onFileSelect={handleFileSelect}
                onRemoveFile={handleRemoveFile}
              />
              <FormFields
                formData={formData}
                tagInput={tagInput}
                showContent={false}
                onFormChange={handleFormChange}
                onTagInputChange={handleTagInputChange}
                onAddTag={handleAddTag}
                onRemoveTag={handleRemoveTag}
              />
              {fileContent && (
                <div className="space-y-2">
                  <Label>Extracted Content</Label>
                  <div className="bg-muted/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                    <pre className="text-sm font-mono whitespace-pre-wrap">{fileContent}</pre>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => {
              setCreateDialogOpen(false)
              resetForm()
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formData.title || (createTab === "text" && !formData.content) || (createTab === "upload" && !fileContent) || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog open={!!editDocument} onOpenChange={(open) => {
        if (!open) {
          setEditDocument(null)
          resetForm()
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>
              Update the document content and metadata.
            </DialogDescription>
          </DialogHeader>
          <FormFields
            formData={formData}
            tagInput={tagInput}
            showContent={true}
            onFormChange={handleFormChange}
            onTagInputChange={handleTagInputChange}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setEditDocument(null)
              resetForm()
            }}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={!formData.title || updateMutation.isPending}
            >
              {updateMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Document Dialog */}
      <Dialog open={!!viewDocument} onOpenChange={(open) => !open && setViewDocument(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start gap-3">
              {viewDocument && (
                <div className={`p-2 rounded-lg ${documentTypeConfig[viewDocument.document_type].color}`}>
                  {(() => {
                    const Icon = documentTypeConfig[viewDocument.document_type].icon
                    return <Icon className="h-5 w-5" />
                  })()}
                </div>
              )}
              <div>
                <DialogTitle className="text-xl">{viewDocument?.title}</DialogTitle>
                {viewDocument?.description && (
                  <DialogDescription className="mt-1">
                    {viewDocument.description}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>
          {viewDocument && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary" className={statusConfig[viewDocument.status].color}>
                  {(() => {
                    const Icon = statusConfig[viewDocument.status].icon
                    return <Icon className="h-3 w-3 mr-1" />
                  })()}
                  {statusConfig[viewDocument.status].label}
                </Badge>
                <Badge variant="outline">
                  {documentTypeConfig[viewDocument.document_type].label}
                </Badge>
                {viewDocument.category && (
                  <Badge variant="outline">
                    <FolderOpen className="h-3 w-3 mr-1" />
                    {viewDocument.category}
                  </Badge>
                )}
                {viewDocument.file_name && (
                  <Badge variant="outline">
                    <File className="h-3 w-3 mr-1" />
                    {viewDocument.file_name}
                  </Badge>
                )}
              </div>
              {viewDocument.tags && viewDocument.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {viewDocument.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted"
                    >
                      <Tags className="h-2.5 w-2.5 mr-1" />
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="bg-muted/50 rounded-lg p-4 max-h-[400px] overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {viewDocument.content || "No content available"}
                </pre>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span>Created {formatDistanceToNow(new Date(viewDocument.created_at), { addSuffix: true })}</span>
                {viewDocument.usage_count > 0 && (
                  <span>• Used {viewDocument.usage_count} times</span>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDocument(null)}>
              Close
            </Button>
            <Button onClick={() => {
              if (viewDocument) {
                handleEdit(viewDocument)
                setViewDocument(null)
              }
            }}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDocument} onOpenChange={(open) => !open && setDeleteDocument(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteDocument?.title}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
