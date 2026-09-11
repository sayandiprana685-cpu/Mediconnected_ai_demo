export function validate(schema) {
  return (req, res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return res.status(422).json({
        error: issue?.message || "Validation failed.",
        code: "VALIDATION",
        fields: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    req.validated = parsed.data;
    next();
  };
}
