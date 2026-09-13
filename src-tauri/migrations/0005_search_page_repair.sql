-- Riparazioni della 0004, che non si può più toccare: era già applicata.
--
-- 1. Il conteggio dei risultati restava vuoto quando il testo salvato non
--    dichiarava i risultati, e la colonna non ammette il vuoto.
UPDATE search_pages SET received = 0 WHERE received IS NULL;
-- 2. Una pagina scritta da due tentativi veniva attribuita al più vecchio.
--    Vale l'ultimo che l'ha davvero scritta.
UPDATE search_pages SET execution_id = (
  SELECT e.id FROM search_executions e JOIN jobs j ON j.id = e.id
  WHERE e.result_set_id = search_pages.result_set_id AND e.page = search_pages.page
    AND j.checkpoint = 'page_committed'
  ORDER BY e.generation DESC LIMIT 1
)
WHERE EXISTS (
  SELECT 1 FROM search_executions e JOIN jobs j ON j.id = e.id
  WHERE e.result_set_id = search_pages.result_set_id AND e.page = search_pages.page
    AND j.checkpoint = 'page_committed'
);
