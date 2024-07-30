export function convertToISOString(input?: string): string {
  if (!input) return new Date().toISOString();
  
  const date = new Date(input);

  // Check if the input string is a valid date
  if (!isNaN(date.getTime())) {
    return date.toISOString();
  } else {
    // If the input is not a valid date, return the current date as ISO string
    return new Date().toISOString();
  }
}