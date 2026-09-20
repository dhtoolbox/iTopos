function decodeTimePeriod(codeString) {
  if (!codeString) return "Unknown Era";

  const eras = [];
  if (codeString.includes("A")) eras.push("Archaic");
  if (codeString.includes("C")) eras.push("Classical");
  if (codeString.includes("H")) eras.push("Hellenistic");
  if (codeString.includes("R")) eras.push("Roman");
  if (codeString.includes("L")) eras.push("Late Antique");
  if (codeString.includes("M")) eras.push("Mediaeval");

  // Returns a readable string like "Hellenistic, Roman, Late Antique"
  return eras.length > 0 ? eras.join(", ") : `Unknown Code (${codeString})`;
}

// Example usage inside an iTópos map popup handler:
const readableTimeline = decodeTimePeriod(feature.properties.timeperiod);
