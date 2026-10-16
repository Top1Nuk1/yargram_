import type { Request } from "express";
export type MultipartFile = {
    fieldName: string;
    fileName: string;
    mimeType: string;
    data: Buffer;
};
export declare function readMultipartFile(request: Request, options: {
    fieldName: string;
    maxBodyBytes: number;
}): Promise<MultipartFile>;
