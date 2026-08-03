# Guía de Onboarding — CondoGATE

Para administradores que ya tienen un portón RTU5024 funcionando.

---

## Lo que necesitas antes de empezar

| Ítem | Dónde encontrarlo |
| ---- | ----------------- |
| Número SIM del RTU | Sticker en el dispositivo o contrato del operador |
| Contraseña del RTU | Por defecto `1234` (si no fue cambiada) |
| Número de teléfono maestro actual | El número desde el que hoy se controla el RTU |
| Lista de residentes | Nombre, teléfono E.164, email |

---

## Paso 1 — Configura el RTU para aceptar comandos de CondoGATE

> Este paso lo hace el administrador desde su teléfono actual (el número maestro).

CondoGATE usa el número **+56 X XXXX XXXX** (tu número Twilio asignado) para enviar comandos al portón. El RTU debe autorizarlo.

**Envía este SMS al número SIM del RTU:**

```text
1234P+56TUNUM#+56TWILIO#
     ^tu número actual  ^número CondoGATE
```

Reemplaza:

- `1234` → tu contraseña del RTU
- `+56TUNUM` → tu número maestro actual (el que usas hoy para controlar el portón)
- `+56TWILIO` → el número Twilio asignado por CondoGATE

> ⚠️ **Incluye siempre tu número actual en el comando.** Si envías solo el número Twilio, perderás control manual del portón.

El RTU responde `Set OK` si fue aceptado. Tu número sigue funcionando normalmente — CondoGATE queda como controlador adicional, no reemplaza al tuyo.

---

## Paso 2 — Verifica la conexión

Una vez configurado, CondoGATE hace una prueba automática consultando el listado de números autorizados. Verás el resultado en el dashboard del administrador.

Si prefieres verificar manualmente, envía desde el número Twilio al SIM del RTU:

```text
1234AL#
```

El RTU responde con la lista de slots activos. Si responde, la conexión está lista.

---

## Paso 3 — Registra el condominio

El equipo de CondoGATE (o tú como admin técnico) corre el seed con tus datos:

```bash
tsx scripts/seed.ts \
  --email=admin@tucondominio.cl \
  --nombre=Juan \
  --apellido=Pérez \
  --telefono=+56911110000 \
  --unidad="Casa 1" \
  --condominio="Condominio Vista" \
  --sim=+56922223333
```

Esto crea en la base de datos:

- El condominio y la propiedad
- El dispositivo RTU vinculado
- Tu residente y usuario de acceso

---

## Paso 4 — Residentes reciben el enlace de acceso

Cada residente recibe un email con un enlace mágico (magic link). Al hacer clic:

1. Quedan autenticados automáticamente
2. Ven el dashboard con sus invitaciones
3. Pueden crear permisos de acceso para visitantes de inmediato

No se requiere contraseña ni instalación de app.

---

## Paso 5 — Primera invitación (smoke test)

Como administrador, crea una invitación de prueba desde el dashboard:

- Visitante: tu propio nombre y teléfono
- Ventana: los próximos 5 minutos

Cuando el sistema la active, recibirás un SMS de confirmación y el portón quedará programado para abrirse con tu llamada. Si el ciclo completa (CREATED → ACTIVE), el onboarding fue exitoso.

---

## Preguntas frecuentes

**¿El portón deja de funcionar durante el onboarding?**
No. El RTU sigue aceptando comandos del número maestro original. CondoGATE se agrega como número adicional autorizado.

**¿Qué pasa si el RTU ya tiene slots ocupados?**
CondoGATE asigna slots del 100 al 200 para invitaciones temporales. Los slots de residentes permanentes (1–99) no se tocan.

**¿Cuántos residentes puede manejar el sistema?**
El RTU5024 admite hasta 99 números permanentes y 100 slots de invitación. CondoGATE respeta ese límite.

**¿El visitante necesita instalar algo?**
No. El acceso se activa por número de teléfono. El visitante llama al portón y entra, igual que siempre.

---

## Checklist de onboarding

- [ ] Número SIM del RTU identificado
- [ ] Contraseña RTU confirmada
- [ ] SMS de autorización enviado → RTU respondió `Set OK`
- [ ] Seed ejecutado → condominio registrado en DB
- [ ] Residentes recibieron magic link
- [ ] Al menos un residente ingresó al dashboard
- [ ] Invitación de prueba creada y activada exitosamente
