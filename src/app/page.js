"use client";

import {useState} from "react";

export default function HomePage() {
    const [textareas, setTextareas] = useState([""]);

    const addTextarea = () => {
        setTextareas([...textareas, ""]);
    };

    const handleChange = (index, value) => {
        const newTextareas = [...textareas];
        newTextareas[index] = value;
        setTextareas(newTextareas);
    };

    return (
        <div className="min-h-screen p-10 bg-gray-100 flex flex-col gap-6">
            <h1 className="text-2xl font-bold text-center">Dynamic Textareas</h1>

            {textareas.map((text, index) => (
                <textarea
                    key={index}
                    value={text}
                    onChange={(e) => handleChange(index, e.target.value)}
                    className="w-full p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={`Textarea ${index + 1}`}
                />
            ))}

            <button
                onClick={addTextarea}
                className="w-full p-3 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition"
            >
                Add Textarea
            </button>
        </div>
    );
}