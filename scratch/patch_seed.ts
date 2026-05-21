import fs from 'fs';

const seedFile = 'd:\\Shanto\\Projects\\skillBridge\\SkillBridge-server\\prisma\\seed.ts';
let content = fs.readFileSync(seedFile, 'utf8');

const generatedTutors = fs.readFileSync('d:\\Shanto\\Projects\\skillBridge\\SkillBridge-server\\scratch\\generated_tutors.ts', 'utf8');

// Replace the old tutorsData
const startStr = '// ============ 30 TUTORS WITH PROFILE IMAGES ============';
const endStr = 'const studentData = [';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + 
            '// ============ 32 TUTORS WITH LOCAL PROFILE IMAGES ============\n' + 
            generatedTutors + '\n\n' + 
            content.substring(endIndex);
}

// Add explicit deletion at the top of main()
const mainStr = 'async function main() {\n  try {\n';
const deleteStr = `    // EXPLICIT CLEANUP (Step 1)\n    console.log("🧹 Wiping existing tutor data...");\n    // Delete reviews, bookings, availability, tutor_subjects, tutor_profiles and tutors.\n    // Since we are deleting users with role TUTOR, and schema has onDelete: Cascade,\n    // this will safely wipe all dependent rows.\n    await prisma.user.deleteMany({ where: { role: "TUTOR" } });\n    console.log("✓ Cleanup complete.\\n");\n`;

content = content.replace(mainStr, mainStr + deleteStr);

// Change getImage(t.imageSeed) to t.imageLocal
content = content.replace(/image:\s*getImage\(t\.imageSeed\),/g, 'image: t.imageLocal,');

fs.writeFileSync(seedFile, content);
console.log('Successfully patched seed.ts');
