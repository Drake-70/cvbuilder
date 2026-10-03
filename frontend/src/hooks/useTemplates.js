import { useEffect, useState } from 'react';
import api from '../services/api';
import { PDFKIT_TEMPLATES } from '../constants/templates';

/**
 * Which document templates this deployment can actually render.
 *
 * Whether the LaTeX templates exist is a property of the running image, not of
 * the frontend bundle: the engine is installed by the Dockerfile and nowhere else.
 * So the picker asks the server rather than carrying a list, which is also what
 * stops it offering a LaTeX template on a build without the engine, where picking
 * it would silently hand back a pdfkit document instead.
 *
 * The pdfkit six are returned as the fallback for both formats. They render on
 * every build, so a failed request leaves a working picker rather than an empty
 * one. That is a deliberate asymmetry: under-offering costs the user two options
 * for a moment, over-offering costs them a document they did not choose.
 *
 * @returns {{pdf: string[], docx: string[], engine: string|null, ready: boolean}}
 */
export default function useTemplates() {
  const [available, setAvailable] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/document/templates')
      .then((res) => {
        if (cancelled) return;
        setAvailable(res.data);
      })
      .catch(() => {
        // Left null on purpose: templatesForFormat treats null as "server said
        // nothing", which yields the pdfkit six. Swallowing the error here is what
        // makes that fallback reachable instead of an exception at render time.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return {
    pdf: available && Array.isArray(available.pdf) ? available.pdf : PDFKIT_TEMPLATES,
    docx: available && Array.isArray(available.docx) ? available.docx : PDFKIT_TEMPLATES,
    engine: (available && available.engine) || null,
    ready
  };
}