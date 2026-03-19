import bcrypt from "bcryptjs";

async function testPassword() {
  const hash = "$2a$12$Q0u1q8x8ZgV0nYp6n7G8Uu4p7Yq6n6lY8Q8GQ8pQ8Q8Q8Q8Q8Q8Q";
  const plainPassword = "admin123";

  const isMatch = await bcrypt.compare(plainPassword, hash);
  console.log("Le mot de passe correspond ?", isMatch);
}

testPassword();
