"use client";

import { useEffect, useState } from "react";
import type { Filters, JobResults } from "@/lib/jobs";
import { JobsView, queryHref } from "./jobs-view";

export function CsrJobs({ filters }: { filters: Filters }) {
  const [data, setData] = useState<JobResults>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const url = queryHref("/api/jobs", filters, filters.page);
  useEffect(() => {
    const controller = new AbortController();
    setData(undefined);
    setError("");
    fetch(url, { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok)
          throw new Error("요청에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return response.json();
      })
      .then(setData)
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "연결을 확인해 주세요.",
          );
      });
    return () => controller.abort();
  }, [url, attempt]);
  return (
    <JobsView
      filters={data?.filters ?? filters}
      data={data}
      mode="csr"
      error={error}
      retry={() => setAttempt(attempt + 1)}
    />
  );
}
