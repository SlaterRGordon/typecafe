import { useState } from 'react';
import { NextPage } from 'next';
import { SupportCard } from '~/components/support/SupportCard';

const Support: NextPage = () => {

    return (
        <div className="container mx-auto p-4">
            <div className="flex flex-col justify-center items-center min-h-screen">
                <SupportCard showDismiss={false} />
            </div>
        </div>
    );
};

export default Support;