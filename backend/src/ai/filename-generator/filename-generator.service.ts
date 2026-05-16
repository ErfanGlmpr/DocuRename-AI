import { Injectable } from '@nestjs/common';
import { DocumentMetadata } from '../ai.provider';

@Injectable()
export class FilenameGeneratorService {
  generateSafeFilename(metadata: DocumentMetadata): string {
    let baseName = '';

    if (
      metadata.suggestedFilename &&
      metadata.suggestedFilename.trim().length > 0
    ) {
      baseName = metadata.suggestedFilename;
    } else {
      const datePart = metadata.documentDate || 'unknown-date';
      const categoryPart = metadata.category || 'other';
      const issuerPart = metadata.issuer ? `_${metadata.issuer}` : '';
      const refPart = metadata.referenceNumber
        ? `_${metadata.referenceNumber}`
        : '';

      baseName = `${datePart}_${categoryPart}${issuerPart}${refPart}`;
    }

    return this.sanitizeFilename(baseName);
  }

  private sanitizeFilename(name: string): string {
    let sanitized = name.toLowerCase();

    // Replace spaces and special chars with hyphens
    sanitized = sanitized.replace(/[^a-z0-9-_.]/g, '-');

    // Remove duplicate hyphens
    sanitized = sanitized.replace(/-+/g, '-');

    // Ensure it ends with .pdf
    if (!sanitized.endsWith('.pdf')) {
      sanitized += '.pdf';
    }

    // Max length 140 (keeping some room for appending _2, _3 if needed later)
    if (sanitized.length > 140) {
      const ext = '.pdf';
      sanitized = sanitized.substring(0, 140 - ext.length) + ext;
    }

    return sanitized;
  }
}
