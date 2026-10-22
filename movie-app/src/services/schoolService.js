import { signInWithCustomToken, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../firebase/firebase";

export async function callSchool(name, data = {}) {
  const callable = httpsCallable(functions, name);
  const result = await callable(data);
  return result.data;
}

export async function loginWithSchoolCode(loginId, loginCode) {
  const result = await callSchool("schoolLogin", { loginId, loginCode });
  await signInWithCustomToken(auth, result.token);
}

export function logoutSchool() {
  return signOut(auth);
}