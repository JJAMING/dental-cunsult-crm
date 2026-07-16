"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import {
  ConsultationFormDialog,
  type ConsultationFormInput,
} from "@/components/consultations/consultation-form-dialog";
import { useConsultations } from "@/hooks/use-consultations";

export function ConsultationRegisterDialog() {
  const [saveErrorMessage, setSaveErrorMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const { addConsultation } = useConsultations();

  const handleSubmit = async (input: ConsultationFormInput) => {
    try {
      setSaveErrorMessage("");
      await addConsultation(input);
      setIsOpen(false);
    } catch (error) {
      setSaveErrorMessage(error instanceof Error ? error.message : "상담일지 저장에 실패했습니다.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSaveErrorMessage("");
          setIsOpen(true);
        }}
        className="inline-flex w-fit items-center gap-2 rounded-full bg-monday-violet px-5 py-3 text-sm font-bold text-white shadow-[rgba(97,97,255,0.22)_0_12px_28px] transition hover:brightness-95"
      >
        <Save className="h-4 w-4" aria-hidden />
        신규 상담 등록
      </button>

      {isOpen ? (
        <ConsultationFormDialog
          title="신규 상담 등록"
          submitLabel="등록"
          onClose={() => setIsOpen(false)}
          onSubmit={handleSubmit}
          saveErrorMessage={saveErrorMessage}
        />
      ) : null}
    </>
  );
}
