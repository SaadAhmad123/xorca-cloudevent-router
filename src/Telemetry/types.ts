export type TelemetryLogLevels = |
  "DEBUG"     | // Used for detailed information, typically of interest only when diagnosing problems.
  "INFO"      | // Used for general information about program execution.
  "WARNING"   | // Indicates an unexpected event or a potential problem that doesn't prevent the program from working.
  "ERROR"     | // Used for more serious problems that prevent a specific function or feature from working correctly.
  "CRITICAL"    // Used for very serious errors that might prevent the entire program from running.

export type TelemetryContext = {
  traceparent: string | null;
  tracestate: string | null;
}