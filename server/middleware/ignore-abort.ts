const mark = globalThis as { __fanzoneIgnoreAbort?: boolean };

if (!mark.__fanzoneIgnoreAbort) {
  mark.__fanzoneIgnoreAbort = true;
  process.on("unhandledRejection", (reason) => {
    const err = reason as { code?: string; message?: string; cause?: { code?: string } } | undefined;
    const code = err?.code || err?.cause?.code;
    if (code === "ECONNRESET" || err?.message === "aborted") {
      console.error("[fanzone] client closed the connection");
      return;
    }
    console.error("[fanzone] unhandledRejection", reason);
  });
}

export default function ignoreAbort(_event: unknown, next: () => unknown) {
  return next();
}
