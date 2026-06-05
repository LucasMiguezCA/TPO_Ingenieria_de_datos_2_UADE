import { Picker } from "@react-native-picker/picker";

type Opcion = {
  label: string;
  value: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  opciones: Opcion[];
};

export default function CustomPicker({
  value,
  onChange,
  opciones,
}: Props) {
  return (
    <Picker
      selectedValue={value}
      onValueChange={onChange}
    >
      {opciones.map((opcion) => (
        <Picker.Item
          key={opcion.value}
          label={opcion.label}
          value={opcion.value}
        />
      ))}
    </Picker>
  );
}