"use client"

import { useState, useCallback, useEffect, useRef, memo } from "react"
import { useParams } from "next/navigation"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
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
  MoreVertical,
  Eye,
  Pencil,
  Trash2,
  Loader2,
  Clock,
  AlertCircle,
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
} from "@/lib/hooks/use-workspace-knowledge-base"
import type { KnowledgeDocument } from "@/types/database.types"
import { formatDistanceToNow } from "date-fns"

// ============================================================================
// CONSTANTS
// ============================================================================

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
  content: string
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
  return (
    <Card className="group hover:shadow-md transition-all duration-200 border-border/60 hover:border-primary/30">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="p-2.5 rounded-lg shrink-0 bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-base leading-tight line-clamp-1">{doc.title}</h3>
              {doc.description && (
                <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">{doc.description}</p>
              )}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
      <CardContent className="pt-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {formatDistanceToNow(new Date(doc.created_at), { addSuffix: true })}
          </span>
          {doc.usage_count > 0 && (
            <span className="text-primary/70">Used {doc.usage_count}×</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
})

// Form Fields Component
const FormFields = memo(function FormFields({ 
  formData,
  showContent = true,
  onFormChange,
}: { 
  formData: FormData
  showContent?: boolean
  onFormChange: (field: keyof FormData, value: string) => void
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
        <Label htmlFor="form-description">Description</Label>
        <Textarea
          id="form-description"
          placeholder="Brief description of this document (optional)"
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2 min-w-0">
                <Skeleton className="h-5 w-4/5" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <Skeleton className="h-4 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
})

// Pagination Component
const Pagination = memo(function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange, 
  isLoading 
}: { 
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  isLoading: boolean
}) {
  if (totalPages <= 1) return null

  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const showEllipsis = totalPages > 7
    
    if (!showEllipsis) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 4; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      } else if (currentPage >= totalPages - 2) {
        pages.push(1)
        pages.push('...')
        for (let i = totalPages - 3; i <= totalPages; i++) pages.push(i)
      } else {
        pages.push(1)
        pages.push('...')
        for (let i = currentPage - 1; i <= currentPage + 1; i++) pages.push(i)
        pages.push('...')
        pages.push(totalPages)
      }
    }
    return pages
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1 || isLoading}
        className="h-9 px-3"
      >
        Previous
      </Button>
      <div className="flex items-center gap-1 mx-2">
        {getPageNumbers().map((page, idx) => (
          typeof page === 'number' ? (
            <Button
              key={idx}
              variant={currentPage === page ? "default" : "ghost"}
              size="sm"
              onClick={() => onPageChange(page)}
              disabled={isLoading}
              className="h-9 w-9"
            >
              {page}
            </Button>
          ) : (
            <span key={idx} className="px-2 text-muted-foreground">
              {page}
            </span>
          )
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages || isLoading}
        className="h-9 px-3"
      >
        Next
      </Button>
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
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 12

  // Debounced search query
  const debouncedSearch = useDebounce(searchInput, 300)

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

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
    content: "",
  })

  // File upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [fileContent, setFileContent] = useState<string>("")
  const [isReadingFile, setIsReadingFile] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Data hooks
  const { data, isLoading, error, refetch, isFetching } = useWorkspaceKnowledgeBase({
    search: debouncedSearch || undefined,
    page: currentPage,
    pageSize,
  })
  const createMutation = useCreateKnowledgeDocument()
  const updateMutation = useUpdateKnowledgeDocument()
  const deleteMutation = useDeleteKnowledgeDocument()

  // Callbacks
  const resetForm = useCallback(() => {
    setFormData({
      title: "",
      description: "",
      content: "",
    })
    setUploadedFile(null)
    setFileContent("")
    setFileError(null)
    setCreateTab("text")
  }, [])

  const handleFormChange = useCallback((field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
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
      content: doc.content || "",
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
        document_type: "document", // Default to document type
        content: contentToSave || undefined,
        tags: [], // Default empty tags
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
          content: formData.content || null,
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

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search documents..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-10"
        />
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
              {searchInput ? "No documents found" : "No documents yet"}
            </h3>
            <p className="text-muted-foreground text-center max-w-sm mt-2">
              {searchInput
                ? "Try adjusting your search query."
                : "Add documents and information to help your AI agents provide accurate answers."}
            </p>
            {!searchInput && (
              <Button className="mt-6" onClick={() => setCreateDialogOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                Add Document
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Documents Grid */}
      {data?.data && data.data.length > 0 && (
        <div className="space-y-4">
          {/* Grid with loading overlay */}
          <div className="relative">
            {isFetching && !isLoading && (
              <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
          </div>
          
          {/* Results info and pagination */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, data.total)} of {data.total} documents
            </p>
            <Pagination
              currentPage={currentPage}
              totalPages={data.totalPages || 1}
              onPageChange={setCurrentPage}
              isLoading={isFetching}
            />
          </div>
        </div>
      )}

      {/* Create Document Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={(open) => {
        if (createMutation.isPending) return
        setCreateDialogOpen(open)
        if (!open) resetForm()
      }}>
        <DialogContent className="sm:max-w-xl md:max-w-2xl flex flex-col max-h-[85vh]">
          {createMutation.isPending && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground font-medium">Creating document...</p>
              </div>
            </div>
          )}
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Create Document
            </DialogTitle>
            <DialogDescription>
              Add a new document to your knowledge base for AI agents to reference.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6">
            <Tabs value={createTab} onValueChange={(v) => setCreateTab(v as "text" | "upload")}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="text" className="flex items-center gap-2" disabled={createMutation.isPending}>
                  <FileText className="h-4 w-4" />
                  Write Content
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex items-center gap-2" disabled={createMutation.isPending}>
                  <Upload className="h-4 w-4" />
                  Upload File
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="text" className="mt-0 space-y-4">
                <FormFields
                  formData={formData}
                  showContent={true}
                  onFormChange={handleFormChange}
                />
              </TabsContent>
              
              <TabsContent value="upload" className="mt-0 space-y-4">
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
                  showContent={false}
                  onFormChange={handleFormChange}
                />
              </TabsContent>
            </Tabs>
          </div>

          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => {
              setCreateDialogOpen(false)
              resetForm()
            }} disabled={createMutation.isPending}>
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
        if (updateMutation.isPending) return
        if (!open) {
          setEditDocument(null)
          resetForm()
        }
      }}>
        <DialogContent className="sm:max-w-xl md:max-w-2xl flex flex-col max-h-[85vh]">
          {updateMutation.isPending && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground font-medium">Saving changes...</p>
              </div>
            </div>
          )}
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Edit Document
            </DialogTitle>
            <DialogDescription>
              Update the document title, description, or content.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6">
            <FormFields
              formData={formData}
              showContent={true}
              onFormChange={handleFormChange}
            />
          </div>
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => {
              setEditDocument(null)
              resetForm()
            }} disabled={updateMutation.isPending}>
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
        <DialogContent className="sm:max-w-2xl md:max-w-3xl flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl">{viewDocument?.title}</DialogTitle>
                {viewDocument?.description && (
                  <DialogDescription className="mt-1.5">
                    {viewDocument.description}
                  </DialogDescription>
                )}
              </div>
            </div>
          </DialogHeader>
          {viewDocument && (
            <div className="flex-1 overflow-y-auto py-4 -mx-6 px-6 space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 border min-h-[200px] max-h-[400px] overflow-y-auto">
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {viewDocument.content || "No content available"}
                </pre>
              </div>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  Created {formatDistanceToNow(new Date(viewDocument.created_at), { addSuffix: true })}
                </span>
                {viewDocument.usage_count > 0 && (
                  <span>• Used {viewDocument.usage_count} times</span>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="shrink-0 pt-4 border-t">
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
