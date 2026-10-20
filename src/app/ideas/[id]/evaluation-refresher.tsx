"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 5000;
const MAX_DURATION_MS = 10 * 60 * 1000;

/** Atualiza a página enquanto a avaliação da IA está em andamento. */
export function EvaluationRefresher() {
  const router = useRouter();

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (Date.now() - startedAt > MAX_DURATION_MS) {
        window.clearInterval(timer);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  return null;
}
