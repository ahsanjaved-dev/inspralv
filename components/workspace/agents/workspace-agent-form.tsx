"use client"

import { useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Key, Plus, Trash2, Eye, EyeOff, Lock, Globe } from "lucide-react"
import type { AIAgent } from "@/types/database.types"
import type { CreateWorkspaceAgentInput } from "@/types/api.types"
import Link from "next/link"
import { useParams } from "next/navigation"

interface WorkspaceAgentFormProps {
  initialData?: AIAgent
  onSubmit: (data: CreateWorkspaceAgentInput) => Promise<void>
  isSubmitting: boolean
}

const apiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "Key name is required"),
  key: z.string().min(1, "API key is required"),
  provider: z.string().optional(),
  is_active: z.boolean(),
})

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
  provider: z.enum(["vapi", "retell", "synthflow"] as const),
  voice_provider: z
    .enum(["elevenlabs", "deepgram", "azure", "openai", "cartesia"] as const)
    .optional(),
  model_provider: z.enum(["openai", "anthropic", "google", "groq"] as const).optional(),
  transcriber_provider: z.enum(["deepgram", "assemblyai", "openai"] as const).optional(),
  config: z
    .object({
      system_prompt: z.string().optional(),
      first_message: z.string().optional(),
    })
    .optional(),
  agent_secret_api_key: z.array(apiKeySchema).optional().default([]),
  agent_public_api_key: z.array(apiKeySchema).optional().default([]),
  is_active: z.boolean(),
})

type FormData = z.infer<typeof formSchema>

function generateUUID(): string {
  return crypto.randomUUID()
}

export function WorkspaceAgentForm({
  initialData,
  onSubmit,
  isSubmitting,
}: WorkspaceAgentFormProps) {
  const params = useParams()
  const workspaceSlug = params.workspaceSlug as string
  const [showSecretKey, setShowSecretKey] = useState<Record<number, boolean>>({})
  const [showPublicKey, setShowPublicKey] = useState<Record<number, boolean>>({})

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema) as any,
    defaultValues: {
      name: initialData?.name || "",
      description: initialData?.description || "",
      provider: (initialData?.provider as FormData["provider"]) || "vapi",
      voice_provider: (initialData?.voice_provider as FormData["voice_provider"]) || undefined,
      model_provider: (initialData?.model_provider as FormData["model_provider"]) || undefined,
      transcriber_provider:
        (initialData?.transcriber_provider as FormData["transcriber_provider"]) || undefined,
      is_active: initialData?.is_active ?? true,
      config: {
        system_prompt: (initialData?.config as any)?.system_prompt || "",
        first_message: (initialData?.config as any)?.first_message || "",
      },
      agent_secret_api_key: initialData?.agent_secret_api_key || [],
      agent_public_api_key: initialData?.agent_public_api_key || [],
    },
  })

  const {
    fields: secretKeyFields,
    append: appendSecretKey,
    remove: removeSecretKey,
  } = useFieldArray({
    control,
    name: "agent_secret_api_key",
  })

  const {
    fields: publicKeyFields,
    append: appendPublicKey,
    remove: removePublicKey,
  } = useFieldArray({
    control,
    name: "agent_public_api_key",
  })

  const selectedProvider = watch("provider")

  const handleFormSubmit = async (data: FormData) => {
    await onSubmit(data as CreateWorkspaceAgentInput)
  }

  const addSecretKey = () => {
    appendSecretKey({
      id: generateUUID(),
      name: `${selectedProvider.toUpperCase()} Secret Key`,
      key: "",
      provider: selectedProvider,
      is_active: true,
    })
  }

  const addPublicKey = () => {
    appendPublicKey({
      id: generateUUID(),
      name: `${selectedProvider.toUpperCase()} Public Key`,
      key: "",
      provider: selectedProvider,
      is_active: true,
    })
  }

  const getProviderDisplayName = (provider: string) => {
    switch (provider) {
      case "vapi":
        return "VAPI"
      case "retell":
        return "Retell AI"
      case "synthflow":
        return "Synthflow"
      default:
        return provider
    }
  }

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Basic Information Card */}
      <Card>
        <CardHeader>
          <CardTitle>Basic Information</CardTitle>
          <CardDescription>Configure the basic settings for your AI agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">
              Agent Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g., Sales Assistant"
              {...register("name")}
              disabled={isSubmitting}
            />
            {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder="Describe what this agent does..."
              {...register("description")}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="provider">
              AI Provider <span className="text-red-500">*</span>
            </Label>
            <Select
              value={selectedProvider}
              onValueChange={(value: FormData["provider"]) => setValue("provider", value)}
              disabled={isSubmitting}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vapi">Vapi</SelectItem>
                <SelectItem value="retell">Retell AI</SelectItem>
                <SelectItem value="synthflow">Synthflow</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              {...register("is_active")}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-gray-300"
            />
            <Label htmlFor="is_active" className="text-sm font-normal">
              Agent is active and can receive calls
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Secret API Keys Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            Secret API Key (Private)
          </CardTitle>
          <CardDescription>
            Server-side key for creating and syncing agents with{" "}
            {getProviderDisplayName(selectedProvider)}. Keep this secure!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {secretKeyFields.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed rounded-lg">
              <Lock className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Add a secret API key to sync this agent with{" "}
                {getProviderDisplayName(selectedProvider)}.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addSecretKey}>
                <Plus className="w-4 h-4 mr-2" />
                Add Secret Key
              </Button>
            </div>
          ) : (
            <>
              {secretKeyFields.map((field, index) => (
                <div key={field.id} className="p-4 border rounded-lg space-y-3 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Secret Key #{index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSecretKey(index)}
                      disabled={isSubmitting}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Key Name</Label>
                      <Input
                        placeholder="e.g., Production Secret Key"
                        {...register(`agent_secret_api_key.${index}.name`)}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <Select
                        value={watch(`agent_secret_api_key.${index}.provider`) || selectedProvider}
                        onValueChange={(value) =>
                          setValue(`agent_secret_api_key.${index}.provider`, value)
                        }
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vapi">VAPI</SelectItem>
                          <SelectItem value="retell">Retell AI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Secret API Key</Label>
                    <div className="relative">
                      <Input
                        type={showSecretKey[index] ? "text" : "password"}
                        placeholder="sk_..."
                        {...register(`agent_secret_api_key.${index}.key`)}
                        disabled={isSubmitting}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setShowSecretKey((prev) => ({ ...prev, [index]: !prev[index] }))
                        }
                        className="absolute right-0 top-0 h-full px-3"
                      >
                        {showSecretKey[index] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      {...register(`agent_secret_api_key.${index}.is_active`)}
                      disabled={isSubmitting}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label className="text-sm font-normal">Key is active</Label>
                  </div>
                  <input type="hidden" {...register(`agent_secret_api_key.${index}.id`)} />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addSecretKey}>
                <Plus className="w-4 h-4 mr-2" />
                Add Another Secret Key
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Public API Keys Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Public API Key (Optional)
          </CardTitle>
          <CardDescription>
            Client-side key for test calls. Required to enable the "Test Call" feature.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {publicKeyFields.length === 0 ? (
            <div className="text-center py-6 border-2 border-dashed rounded-lg">
              <Globe className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-3">
                Add a public API key to enable test calls for this agent.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={addPublicKey}>
                <Plus className="w-4 h-4 mr-2" />
                Add Public Key
              </Button>
            </div>
          ) : (
            <>
              {publicKeyFields.map((field, index) => (
                <div
                  key={field.id}
                  className="p-4 border rounded-lg space-y-3 bg-blue-50/30 dark:bg-blue-900/10"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Public Key #{index + 1}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removePublicKey(index)}
                      disabled={isSubmitting}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Key Name</Label>
                      <Input
                        placeholder="e.g., Test Call Public Key"
                        {...register(`agent_public_api_key.${index}.name`)}
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Provider</Label>
                      <Select
                        value={watch(`agent_public_api_key.${index}.provider`) || selectedProvider}
                        onValueChange={(value) =>
                          setValue(`agent_public_api_key.${index}.provider`, value)
                        }
                        disabled={isSubmitting}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vapi">VAPI</SelectItem>
                          <SelectItem value="retell">Retell AI</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Public API Key</Label>
                    <div className="relative">
                      <Input
                        type={showPublicKey[index] ? "text" : "password"}
                        placeholder="pk_..."
                        {...register(`agent_public_api_key.${index}.key`)}
                        disabled={isSubmitting}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setShowPublicKey((prev) => ({ ...prev, [index]: !prev[index] }))
                        }
                        className="absolute right-0 top-0 h-full px-3"
                      >
                        {showPublicKey[index] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      {...register(`agent_public_api_key.${index}.is_active`)}
                      disabled={isSubmitting}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <Label className="text-sm font-normal">Key is active</Label>
                  </div>
                  <input type="hidden" {...register(`agent_public_api_key.${index}.id`)} />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addPublicKey}>
                <Plus className="w-4 h-4 mr-2" />
                Add Another Public Key
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Voice & Model Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle>Voice & Model Settings</CardTitle>
          <CardDescription>Choose the voice and language model for your agent</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Voice Provider</Label>
              <Select
                value={watch("voice_provider") || ""}
                onValueChange={(value) =>
                  setValue("voice_provider", value as FormData["voice_provider"])
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select voice" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="deepgram">Deepgram</SelectItem>
                  <SelectItem value="azure">Azure</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="cartesia">Cartesia</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Model Provider</Label>
              <Select
                value={watch("model_provider") || ""}
                onValueChange={(value) =>
                  setValue("model_provider", value as FormData["model_provider"])
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                  <SelectItem value="groq">Groq</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Transcriber</Label>
              <Select
                value={watch("transcriber_provider") || ""}
                onValueChange={(value) =>
                  setValue("transcriber_provider", value as FormData["transcriber_provider"])
                }
                disabled={isSubmitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select transcriber" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepgram">Deepgram</SelectItem>
                  <SelectItem value="assemblyai">AssemblyAI</SelectItem>
                  <SelectItem value="openai">OpenAI Whisper</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Prompt Configuration</CardTitle>
          <CardDescription>Define how your agent behaves and responds</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="system_prompt">System Prompt</Label>
            <textarea
              id="system_prompt"
              className="w-full min-h-[120px] px-3 py-2 text-sm rounded-md border border-input bg-background resize-y"
              placeholder="You are a helpful sales assistant..."
              {...register("config.system_prompt")}
              disabled={isSubmitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="first_message">First Message</Label>
            <Input
              id="first_message"
              placeholder="Hello! How can I help you today?"
              {...register("config.first_message")}
              disabled={isSubmitting}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" disabled={isSubmitting} asChild>
          <Link href={`/w/${workspaceSlug}/agents`}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {initialData ? "Updating..." : "Creating..."}
            </>
          ) : initialData ? (
            "Update Agent"
          ) : (
            "Create Agent"
          )}
        </Button>
      </div>
    </form>
  )
}
