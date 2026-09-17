-- Una sola copia PDF per opera.
--
-- Il PDF di un'opera è uno: quello che la biblioteca dichiara nel suo
-- manifesto. Senza questo vincolo due strade che lo registrano insieme —
-- l'aggiunta dalla ricerca e la verifica aperta nella scheda — potevano
-- crearne due, perché ognuna guardava e poi scriveva senza che il database
-- impedisse la seconda scrittura.
--
-- L'unicità è **parziale**, sulle sole copie PDF: di copie a immagini una
-- stessa opera ne può avere più d'una, ed è un caso legittimo.
DELETE FROM source_versions
 WHERE version_kind = 'pdf'
   AND id NOT IN (
     SELECT id FROM source_versions
      WHERE version_kind = 'pdf'
      GROUP BY source_id
     HAVING MIN(created_at)
   );

CREATE UNIQUE INDEX IF NOT EXISTS idx_source_versions_single_pdf
  ON source_versions(source_id)
  WHERE version_kind = 'pdf';
