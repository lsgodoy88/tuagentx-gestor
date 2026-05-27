import { exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)

export async function notificarWA(numero: string, texto: string): Promise<void> {
  const cmd = `curl -s -X POST "http://localhost:8080/message/sendText/TuAgentX_Demo" -H "Content-Type: application/json" -H "apikey: Ju4n3s_2O26+xK9#mP" --max-time 5 -d "{\\"number\\":\\"${numero}\\",\\"text\\":${JSON.stringify(texto)}}" 2>/dev/null`
  await execAsync(cmd)
}
