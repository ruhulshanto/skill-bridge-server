import fs from 'fs';

const categoriesAndSubjects = [
  { cat: "technology", subjects: ["computer-science", "web-development", "data-science"] },
  { cat: "mathematics", subjects: ["mathematics", "algebra", "calculus", "statistics"] },
  { cat: "languages", subjects: ["english", "spanish", "french", "mandarin"] },
  { cat: "science", subjects: ["physics", "chemistry", "biology"] },
  { cat: "arts", subjects: ["drawing", "painting", "graphic-design"] },
  { cat: "music", subjects: ["piano", "guitar"] }
];

const femaleNames = ["Emma Williams", "Olivia Davis", "Sophia Martinez", "Isabella Taylor", "Mia Brown", "Charlotte Wilson", "Amelia Moore", "Harper Anderson", "Evelyn Thomas", "Abigail Jackson", "Emily White", "Elizabeth Harris", "Mila Martin", "Ella Thompson", "Avery Garcia"];
const maleNames = ["Liam Smith", "Noah Johnson", "Oliver Jones", "Elijah Miller", "James Garcia", "William Rodriguez", "Benjamin Martinez", "Lucas Hernandez", "Henry Lopez", "Alexander Gonzalez", "Mason Perez", "Michael Wilson", "Ethan Anderson", "Daniel Thomas", "Jacob Taylor", "Logan Moore", "Jackson Jackson"];

// Generate exactly 15 females, 17 males
const tutors = [];

for (let i = 0; i < 15; i++) {
  const cat = categoriesAndSubjects[i % categoriesAndSubjects.length];
  const subject = cat.subjects[Math.floor(Math.random() * cat.subjects.length)];
  tutors.push({
    name: femaleNames[i],
    email: `tutor.f${i + 1}@example.com`,
    password: "Tutor@123456",
    imageLocal: `/tutors/tutorGirls${i + 1}.jpg`,
    subjects: [subject],
    bio: `Passionate educator specializing in ${subject}. Committed to helping students achieve their academic and professional goals through rigorous methodology and customized learning plans.`,
    hourlyRate: i % 4 === 0 ? 0 : Math.floor(Math.random() * 5 + 2) * 10, // 0, 20, 30, 40, 50, 60...
    experience: Math.floor(Math.random() * 10) + 2,
    education: "M.Sc. Education",
    availability: [
      { dayOfWeek: 1, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 2, startTime: "09:00", endTime: "17:00" },
      { dayOfWeek: 3, startTime: "09:00", endTime: "17:00" }
    ]
  });
}

for (let i = 0; i < 17; i++) {
  const cat = categoriesAndSubjects[(i + 15) % categoriesAndSubjects.length];
  const subject = cat.subjects[Math.floor(Math.random() * cat.subjects.length)];
  tutors.push({
    name: maleNames[i],
    email: `tutor.m${i + 1}@example.com`,
    password: "Tutor@123456",
    imageLocal: `/tutors/tutorBoy${i + 1}.jpg`,
    subjects: [subject],
    bio: `Dedicated academic professional with years of experience in ${subject}. Focused on practical applications and deep theoretical understanding to build confidence in my students.`,
    hourlyRate: i % 4 === 2 ? 0 : Math.floor(Math.random() * 5 + 3) * 10, // 0, 30, 40, 50, 60, 70...
    experience: Math.floor(Math.random() * 15) + 3,
    education: "Ph.D. / Equivalent",
    availability: [
      { dayOfWeek: 1, startTime: "10:00", endTime: "18:00" },
      { dayOfWeek: 4, startTime: "10:00", endTime: "18:00" },
      { dayOfWeek: 5, startTime: "10:00", endTime: "18:00" }
    ]
  });
}

const out = `const tutorsData = ${JSON.stringify(tutors, null, 2)};`;
fs.writeFileSync('d:\\Shanto\\Projects\\skillBridge\\SkillBridge-server\\scratch\\generated_tutors.ts', out);
