/**
 * Type declarations for @asteasolutions/zod-to-openapi
 * This declaration file ensures TypeScript can find the module types
 */

declare module "@asteasolutions/zod-to-openapi" {
  import type { ZodType, ZodTypeDef } from "zod"

  export class OpenAPIRegistry {
    definitions: Map<string, unknown>
    
    register<T extends ZodType<unknown, ZodTypeDef, unknown>>(
      name: string,
      schema: T
    ): T
    
    registerPath(path: {
      method: "get" | "post" | "put" | "patch" | "delete" | "head" | "options"
      path: string
      summary?: string
      description?: string
      tags?: string[]
      request?: {
        params?: ZodType
        query?: ZodType
        body?: {
          content: {
            [mediaType: string]: {
              schema: ZodType
            }
          }
        }
      }
      responses: {
        [statusCode: number]: {
          description: string
          content?: {
            [mediaType: string]: {
              schema: ZodType
            }
          }
        }
      }
    }): void
  }

  export class OpenApiGeneratorV3 {
    constructor(definitions: Map<string, unknown>)
    
    generateDocument(config: {
      openapi: string
      info: {
        title: string
        version: string
        description?: string
        contact?: {
          name?: string
          email?: string
          url?: string
        }
      }
      servers?: Array<{
        url: string
        description?: string
      }>
      tags?: Array<{
        name: string
        description?: string
      }>
      security?: Array<{
        [scheme: string]: string[]
      }>
    }): object
  }
}

