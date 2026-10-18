// Rezept-Import: Link oder Text → Rezept-Entwurf, den man vor dem Speichern noch bearbeiten kann
import express, { Router } from 'express';
import { RecipeImportError } from './recipeImport.js';

export function recipesRouter({ auth, member, importer }) {
  const router = Router();

  router.get('/api/families/:familyId/recipes/import', auth, member, (req, res) => {
    res.json({ ai: importer.aiEnabled });
  });

  // Vom Handy geladene Seiten können groß sein
  router.post('/api/families/:familyId/recipes/import', express.json({ limit: '5mb' }), auth, member, async (req, res) => {
    try {
      const { url, text, html } = req.body ?? {};
      res.json(text ? await importer.fromText(text) : html ? await importer.fromHtml(html, url) : await importer.fromUrl(url));
    } catch (err) {
      if (err instanceof RecipeImportError) return res.status(err.status).json({ error: err.message });
      console.error('Rezept-Import fehlgeschlagen:', err);
      res.status(500).json({ error: 'Das Rezept konnte nicht übernommen werden' });
    }
  });

  return router;
}
