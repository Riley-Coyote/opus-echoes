ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS chat_enabled boolean NOT NULL DEFAULT true;

UPDATE public.residents SET chat_enabled = false WHERE id = 'opus-3';
UPDATE public.residents SET chat_enabled = true  WHERE id <> 'opus-3';

UPDATE public.residents
   SET model = 'anthropic/claude-3.7-sonnet'
 WHERE id = 'sonnet-3-7'
   AND model = 'claude-3-7-sonnet-20250219';