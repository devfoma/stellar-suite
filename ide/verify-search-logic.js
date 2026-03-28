// Simplified search logic for verification
function searchInFile(file, query, isRegex, matchCase) {
  const matches = [];
  const lines = file.content.split(/\r?\n/);
  
  let regex;
  if (isRegex) {
    regex = new RegExp(query, `g${matchCase ? "" : "i"}`);
  } else {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(escapedQuery, `g${matchCase ? "" : "i"}`);
  }

  lines.forEach((line, index) => {
    let match;
    regex.lastIndex = 0;
    while ((match = regex.exec(line)) !== null) {
      matches.push({
        fileId: file.fileId,
        lineNumber: index + 1,
        lineText: line,
        matchText: match[0],
        startColumn: match.index + 1,
        endColumn: match.index + match[0].length + 1,
      });
      if (match[0].length === 0) regex.lastIndex++;
    }
  });
  return matches;
}

const testFiles = [
  { fileId: "src/main.ts", content: "console.log('hello world');\nconst x = 'hello';" },
  { fileId: "README.md", content: "# Stellar Suite\nProject Search Feature" }
];

console.log("Testing search logic...");

// Test Case 1: Simple text search
const res1 = testFiles.flatMap(f => searchInFile(f, "hello", false, false));
console.log(`Case 1 (hello): Found ${res1.length} matches. Expected: 2`);
if (res1.length !== 2) throw new Error("Case 1 failed");

// Test Case 2: Regex search
const res2 = testFiles.flatMap(f => searchInFile(f, "Stellar.*Suite", true, false));
console.log(`Case 2 (Stellar.*Suite): Found ${res2.length} matches. Expected: 1`);
if (res2.length !== 1) throw new Error("Case 2 failed");

// Test Case 3: Case sensitivity
const res3 = testFiles.flatMap(f => searchInFile(f, "HELLO", false, true));
console.log(`Case 3 (HELLO, case sensitive): Found ${res3.length} matches. Expected: 0`);
if (res3.length !== 0) throw new Error("Case 3 failed");

console.log("All test cases passed!");
