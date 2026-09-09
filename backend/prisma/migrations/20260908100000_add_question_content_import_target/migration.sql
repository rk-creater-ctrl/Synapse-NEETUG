-- Phase 6F: allow the existing content-import workflow to import QBank questions.
ALTER TYPE "ContentImportTarget" ADD VALUE IF NOT EXISTS 'QUESTION';
