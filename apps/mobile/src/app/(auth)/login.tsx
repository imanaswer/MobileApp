import { Feather } from "@expo/vector-icons";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { TextField } from "../../components/ui/fields";
import { SegmentedControl } from "../../components/ui/scaffold";
import { useAuthStore } from "../../stores/auth-store";

type Mode = "staff" | "parent";

export default function LoginScreen() {
  const signInWithEmail = useAuthStore((state) => state.signInWithEmail);
  const requestOtp = useAuthStore((state) => state.requestOtp);
  const confirmOtp = useAuthStore((state) => state.confirmOtp);

  const [mode, setMode] = useState<Mode>("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [code, setCode] = useState("");

  // On success, the auth store flips to "signedIn" and the (auth) layout redirects.
  const run = async (action: () => Promise<void>): Promise<void> => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View className="flex-1 justify-center gap-5 bg-neutral-50 p-6">
      <View className="items-center gap-2">
        <View className="size-14 items-center justify-center rounded-2xl bg-navy-700">
          <Feather name="home" size={28} color="#FFFFFF" />
        </View>
        <Text className="text-display font-semibold text-neutral-900">
          Sri Gujarathi Vidhyalaya
        </Text>
        <Text className="text-sm text-neutral-500">School Portal — sign in to continue</Text>
      </View>

      <Card className="gap-4">
        <SegmentedControl
          options={[
            { key: "staff", label: "Staff" },
            { key: "parent", label: "Parent" },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === "staff" ? (
          <View className="gap-4">
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
            />
            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              textContentType="password"
            />
            <Button
              label="Sign in"
              loading={busy}
              onPress={() => run(() => signInWithEmail(email.trim(), password))}
            />
          </View>
        ) : (
          <View className="gap-4">
            <TextField
              label="Phone number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              textContentType="telephoneNumber"
              editable={!otpSent}
            />
            {otpSent ? (
              <>
                <TextField
                  label="Verification code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                />
                <Button
                  label="Verify code"
                  loading={busy}
                  onPress={() => run(() => confirmOtp(phone.trim(), code.trim()))}
                />
              </>
            ) : (
              <Button
                label="Send code"
                loading={busy}
                onPress={() =>
                  run(async () => {
                    await requestOtp(phone.trim());
                    setOtpSent(true);
                  })
                }
              />
            )}
          </View>
        )}

        {error ? <Text className="text-sm text-danger-600">{error}</Text> : null}
      </Card>
    </View>
  );
}
