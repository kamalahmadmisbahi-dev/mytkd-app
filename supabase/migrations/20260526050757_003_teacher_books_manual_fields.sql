/*
  # Update teacher_books to use manual text fields instead of foreign keys

  1. Changes
    - Add book_name and publication_name text columns to teacher_books
    - Migrate existing data from book_id/publication_id to new text columns
    - Remove foreign key constraints to books and publications tables

  2. Notes
    - Teachers can now enter book and publication names manually
    - This removes dependency on admin-managed books and publications
*/

-- Add new columns
ALTER TABLE teacher_books ADD COLUMN IF NOT EXISTS book_name text DEFAULT '';
ALTER TABLE teacher_books ADD COLUMN IF NOT EXISTS publication_name text DEFAULT '';

-- Migrate existing data
UPDATE teacher_books tb
SET book_name = COALESCE((SELECT name FROM books WHERE id = tb.book_id), ''),
    publication_name = COALESCE((SELECT name FROM publications WHERE id = tb.publication_id), '')
WHERE book_name = '' OR book_name IS NULL;

-- Drop the foreign key constraints and columns (optional - we'll keep them for backward compatibility but make them nullable)
ALTER TABLE teacher_books ALTER COLUMN book_id DROP NOT NULL;
ALTER TABLE teacher_books DROP CONSTRAINT IF EXISTS teacher_books_book_id_fkey;
ALTER TABLE teacher_books DROP CONSTRAINT IF EXISTS teacher_books_publication_id_fkey;
