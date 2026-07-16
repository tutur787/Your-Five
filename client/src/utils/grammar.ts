export function subjectVerb(subject: string, secondPerson: string, thirdPerson: string): string {
  return subject.trim().toLowerCase() === "you" ? secondPerson : thirdPerson;
}
